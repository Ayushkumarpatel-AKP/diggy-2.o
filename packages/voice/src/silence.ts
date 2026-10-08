/**
 * Silence / duration auto-stop for toggle mode — pure and clock-injectable.
 *
 * // INTERFACE FOR INTEGRATION
 * const SILENCE_RMS_THRESHOLD = 0.02;
 * const SILENCE_STOP_MS = 1200;
 * const MAX_RECORDING_MS = 60000;
 * const NO_SPEECH_TIMEOUT_MS = 10000;
 * class SilenceTracker {
 *   constructor(options?);
 *   start(now: number): void;
 *   update(level: number, now: number): AutoStopReason | null;  // fires at most once
 * }
 * // END INTERFACE FOR INTEGRATION
 *
 * Ported from the proven seed recorder. `chrome.commands` has no key-up, so in
 * toggle mode the recorder must decide when the user has stopped speaking.
 */
import type { AutoStopReason } from "./protocol.js";

/** Normalised RMS of the time-domain waveform; 0.02 ≈ −34 dBFS. */
export const SILENCE_RMS_THRESHOLD = 0.02;

/** How long the level must stay under the threshold before we stop. */
export const SILENCE_STOP_MS = 1_200;

/** Hard cap: never record longer than this, however noisy or quiet the room is. */
export const MAX_RECORDING_MS = 60_000;

/** If nothing is ever heard, give up early instead of holding the mic open. */
export const NO_SPEECH_TIMEOUT_MS = 10_000;

export interface SilenceTrackerOptions {
  threshold?: number;
  silenceMs?: number;
  maxMs?: number;
  noSpeechMs?: number;
}

/**
 * Tracks whether the user has clearly started/finished speaking.
 *
 * `update(level, now)` returns the reason to stop exactly once; after that it
 * returns `null` forever, so a background tick can never signal twice.
 */
export class SilenceTracker {
  private readonly threshold: number;
  private readonly silenceMs: number;
  private readonly maxMs: number;
  private readonly noSpeechMs: number;
  private startedAt = 0;
  private lastVoiceAt = 0;
  private heardVoice = false;
  private done = false;

  constructor(options: SilenceTrackerOptions = {}) {
    this.threshold = options.threshold ?? SILENCE_RMS_THRESHOLD;
    this.silenceMs = options.silenceMs ?? SILENCE_STOP_MS;
    this.maxMs = options.maxMs ?? MAX_RECORDING_MS;
    this.noSpeechMs = options.noSpeechMs ?? NO_SPEECH_TIMEOUT_MS;
  }

  /** Arm the tracker at `now` (ms). */
  start(now: number): void {
    this.startedAt = now;
    this.lastVoiceAt = now;
    this.heardVoice = false;
    this.done = false;
  }

  get hasHeardVoice(): boolean {
    return this.heardVoice;
  }

  /** Fold one level sample in; returns a stop reason at most once. */
  update(level: number, now: number): AutoStopReason | null {
    if (this.done) return null;

    if (level >= this.threshold) {
      this.heardVoice = true;
      this.lastVoiceAt = now;
    }
    if (now - this.startedAt >= this.maxMs) return this.finish("max-duration");
    if (!this.heardVoice && now - this.startedAt >= this.noSpeechMs) return this.finish("no-speech");
    if (this.heardVoice && now - this.lastVoiceAt >= this.silenceMs) return this.finish("silence");
    return null;
  }

  private finish(reason: AutoStopReason): AutoStopReason {
    this.done = true;
    return reason;
  }
}
