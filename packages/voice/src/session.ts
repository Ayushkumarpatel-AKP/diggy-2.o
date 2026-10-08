/**
 * VoiceSession — the push-to-talk orchestrator that binds the pieces together:
 * recorder → transcriber (Provider STT) → `BusEvents.VoiceTranscript`, with the
 * avatar's status/state driven for every phase.
 *
 * // INTERFACE FOR INTEGRATION
 * type VoiceSessionState = "idle" | "listening" | "transcribing" | "speaking";
 * interface VoiceRecorder { start(o?): Promise<RecorderStartResult>; stop(): Promise<RecorderStopResult> }
 * interface VoiceSessionOptions {
 *   recorder: VoiceRecorder;
 *   transcribe: Transcriber;
 *   bus?: MessageBus;
 *   avatar?: AvatarAPI;
 *   tts?: TtsEngine;
 *   now?: () => number;
 *   enabled?: boolean;
 *   minClipBase64Length?: number;
 * }
 * interface VoiceTranscriptResult { ok: boolean; text?: string; error?: string }
 * class VoiceSession {
 *   readonly state: VoiceSessionState;
 *   readonly enabled: boolean;
 *   setEnabled(enabled: boolean): void;
 *   press(): Promise<{ ok: boolean; error?: string }>;
 *   release(): Promise<VoiceTranscriptResult>;
 *   toggle(): Promise<VoiceTranscriptResult>;
 *   onSilence(reason: AutoStopReason): Promise<VoiceTranscriptResult>;
 *   speak(text: string, opts?: { mood?: AvatarState }): Promise<void>;
 *   setEnabled / cancel(): void;
 * }
 * // END INTERFACE FOR INTEGRATION
 *
 * Never autoplays: sound is produced only from `speak()`, after the user started a
 * voice turn. Audio is carried in-memory and dropped once transcribed.
 */
import { BusEvents, type AvatarAPI, type AvatarState, type MessageBus } from "@diggy/shared";

import type { AutoStopReason } from "./protocol.js";
import { decodeBase64, type Transcriber } from "./stt.js";
import type { RecorderStartResult, RecorderStopResult } from "./recorder.js";
import { announce, emitAvatarState, VOICE_STATUS } from "./status.js";
import type { TtsEngine } from "./tts.js";

/** The slice of `RecorderController` the session needs (so tests can fake it). */
export interface VoiceRecorder {
  start(options?: { autoStop?: boolean }): Promise<RecorderStartResult>;
  stop(): Promise<RecorderStopResult>;
  /** Optional immediate teardown that produces no clip. */
  cancel?(): void;
}

export type VoiceSessionState = "idle" | "listening" | "transcribing" | "speaking";

export interface VoiceSessionOptions {
  recorder: VoiceRecorder;
  transcribe: Transcriber;
  bus?: MessageBus;
  avatar?: AvatarAPI;
  tts?: TtsEngine;
  enabled?: boolean;
  /** Below this base64 length a clip is treated as empty (a key tap, not speech). */
  minClipBase64Length?: number;
}

export interface VoiceTranscriptResult {
  ok: boolean;
  text?: string;
  error?: string;
}

/** Default minimum base64 length for a usable clip (ported from the seed). */
export const MIN_CLIP_BASE64_LENGTH = 2_000;

export class VoiceSession {
  private readonly _recorder: VoiceRecorder;
  private readonly _transcribe: Transcriber;
  private readonly _bus?: MessageBus;
  private readonly _avatar?: AvatarAPI;
  private readonly _tts?: TtsEngine;
  private readonly _minClip: number;
  private _state: VoiceSessionState = "idle";
  private _enabled: boolean;
  private _releaseInFlight: Promise<VoiceTranscriptResult> | null = null;

  constructor(options: VoiceSessionOptions) {
    this._recorder = options.recorder;
    this._transcribe = options.transcribe;
    this._bus = options.bus;
    this._avatar = options.avatar;
    this._tts = options.tts;
    this._enabled = options.enabled ?? true;
    this._minClip = options.minClipBase64Length ?? MIN_CLIP_BASE64_LENGTH;
  }

  get state(): VoiceSessionState {
    return this._state;
  }

  get enabled(): boolean {
    return this._enabled;
  }

  /** Voice is opt-in: the host flips this from the user's settings. */
  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
    if (!enabled) this.cancel();
  }

  private announceStatus(text: string): void {
    announce({ bus: this._bus, avatar: this._avatar }, text);
  }

  private playState(state: AvatarState): void {
    this._avatar?.play(state);
    if (this._bus) emitAvatarState(this._bus, state);
  }

  /** Open the mic (push-to-talk press). */
  async press(): Promise<{ ok: boolean; error?: string }> {
    if (!this._enabled) return { ok: false, error: "voice-disabled" };
    if (this._state !== "idle") return { ok: true };

    this._state = "listening";
    this.announceStatus(VOICE_STATUS.listening);
    this.playState("listening");

    const started = await this._recorder.start({ autoStop: false });
    if (!started.ok) {
      this._state = "idle";
      return { ok: false, error: started.error ?? "microphone unavailable" };
    }
    return { ok: true };
  }

  /** Close the mic and transcribe (push-to-talk release). */
  release(): Promise<VoiceTranscriptResult> {
    if (this._state !== "listening") {
      return Promise.resolve({ ok: false, error: "not-listening" });
    }
    if (this._releaseInFlight) return this._releaseInFlight;
    const run = this._releaseOnce().finally(() => {
      this._releaseInFlight = null;
    });
    this._releaseInFlight = run;
    return run;
  }

  private async _releaseOnce(): Promise<VoiceTranscriptResult> {
    this._state = "transcribing";
    this.announceStatus(VOICE_STATUS.transcribing);

    const recorded = await this._recorder.stop();
    if (!recorded.ok || !recorded.base64) {
      this._state = "idle";
      return { ok: false, error: recorded.error ?? "no audio captured" };
    }
    if (recorded.base64.length < this._minClip) {
      this._state = "idle";
      return { ok: false, error: "no audio captured" };
    }

    try {
      const text = await this._transcribe(decodeBase64(recorded.base64), {
        mimeType: recorded.mimeType,
      });
      if (!text) {
        this._state = "idle";
        return { ok: false, error: "could not hear that" };
      }
      // The single place a transcript enters the system.
      this._bus?.emit(BusEvents.VoiceTranscript, { text });
      this._state = "idle";
      return { ok: true, text };
    } catch (error) {
      this._state = "idle";
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /** The browser command's toggle (no key-up → press then press again). */
  async toggle(): Promise<VoiceTranscriptResult> {
    if (this._state === "listening") return this.release();
    const result = await this.press();
    return { ok: result.ok, error: result.error };
  }

  /** The offscreen recorder heard silence / hit its cap. */
  onSilence(_reason: AutoStopReason): Promise<VoiceTranscriptResult> {
    return this.release();
  }

  /** Speak a reply through the avatar + TTS engine (never autoplayed). */
  async speak(text: string, opts: { mood?: AvatarState } = {}): Promise<void> {
    if (!this._enabled) return;
    const clean = text.trim();
    if (!clean) return;
    this._state = "speaking";
    this._avatar?.say(clean, opts.mood ?? "speaking");
    this.playState(opts.mood ?? "speaking");
    try {
      await this._tts?.speak(clean);
    } catch {
      /* text-only fallback: the bubble still shows the reply */
    } finally {
      if (this._state === "speaking") this._state = "idle";
    }
  }

  /** Abort the current turn and close the mic. */
  cancel(): void {
    if (this._recorder.cancel) this._recorder.cancel();
    else this._recorder.stop().catch(() => undefined);
    this._state = "idle";
  }
}
