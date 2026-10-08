/**
 * Offscreen document — the hidden audio host for DIGGY voice.
 *
 * Owns the microphone (`getUserMedia` + `MediaRecorder`) and audio playback,
 * because a content script would need the *page's* mic permission while the
 * offscreen extension origin asks for the whole extension once. It also publishes
 * a lip-sync level/band feed while recording and while speaking.
 *
 * The recording core (`RecorderController`, `SilenceTracker`) is the tested
 * `@diggy/voice` package; this file is the thin DOM adapter that supplies the
 * real `getUserMedia`/`MediaRecorder`/`AudioContext` and the message handlers.
 *
 * Messages (see `@diggy/voice` `OFFSCREEN`):
 *   diggy:offscreen-ping   → { ok: true }                     readiness probe
 *   diggy:offscreen-start  → { ok } | { ok:false, error, reason }
 *   diggy:offscreen-stop   → { ok, base64?, mimeType? }
 *   diggy:offscreen-warm   → { ok }                            pre-grant the mic
 *   diggy:offscreen-play   → { ok }                            play a TTS clip
 * The recorder never decides to keep or drop a clip: it only *asks* the
 * background to stop (`diggy:offscreen-silence`), so audio is never sent twice.
 */
import {
  createDomRecorderHost,
  RecorderController,
  SilenceTracker,
  OFFSCREEN,
  type AudioBands,
  type AutoStopReason,
  type RecorderStartResult,
} from "../../../../packages/voice/src/index.js";

const COLLECT_INTERVAL_MS = 50;
const ANALYSER_FFT_SIZE = 2048;

const recorder = new RecorderController(createDomRecorderHost());

let tracker: SilenceTracker | null = null;
let autoStopSignalled = false;
let levelTimer: number | null = null;
let audioContext: AudioContext | null = null;

/* --- lip-sync level meter ------------------------------------------------ */

function getAudioContext(): AudioContext | null {
  const scope = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const Ctor = scope.AudioContext ?? scope.webkitAudioContext;
  if (!Ctor) return null;
  if (!audioContext) audioContext = new Ctor();
  return audioContext;
}

/** Typed straight off the analyser signature so this compiles on every TS version. */
type ByteBuffer = Parameters<AnalyserNode["getByteTimeDomainData"]>[0];

interface Meter {
  source: AudioNode;
  analyser: AnalyserNode;
  time: ByteBuffer;
  freq: ByteBuffer;
  phase: "recording" | "playback";
}

let meter: Meter | null = null;

/** Split the spectrum into low/mid/high averages (0..1 each). */
function bandsFrom(freq: ByteBuffer): AudioBands {
  const third = Math.max(1, Math.floor(freq.length / 3));
  let low = 0;
  let mid = 0;
  let high = 0;
  for (let index = 0; index < freq.length; index += 1) {
    const value = (freq[index] ?? 0) / 255;
    if (index < third) low += value;
    else if (index < third * 2) mid += value;
    else high += value;
  }
  return { low: low / third, mid: mid / third, high: high / third };
}

/** Normalised RMS of the current time-domain waveform (0..1). */
function levelFrom(time: ByteBuffer): number {
  let sum = 0;
  for (let index = 0; index < time.length; index += 1) {
    const sample = ((time[index] ?? 128) - 128) / 128;
    sum += sample * sample;
  }
  return Math.sqrt(sum / time.length);
}

function startMeter(node: AudioNode, phase: "recording" | "playback"): void {
  stopMeter();
  const context = getAudioContext();
  if (!context) return;
  const analyser = context.createAnalyser();
  analyser.fftSize = ANALYSER_FFT_SIZE;
  analyser.smoothingTimeConstant = 0.2;
  node.connect(analyser);
  meter = {
    source: node,
    analyser,
    time: new Uint8Array(analyser.fftSize),
    freq: new Uint8Array(analyser.frequencyBinCount),
    phase,
  };
  levelTimer = window.setInterval(levelTick, COLLECT_INTERVAL_MS);
}

function stopMeter(): void {
  if (levelTimer !== null) {
    window.clearInterval(levelTimer);
    levelTimer = null;
  }
  const active = meter;
  if (active) {
    // Drop only the analyser edge — the playback source stays wired to the output.
    try {
      active.source.disconnect(active.analyser);
    } catch {
      /* already detached */
    }
  }
  meter = null;
}

function levelTick(): void {
  const active = meter;
  if (!active) return;
  active.analyser.getByteTimeDomainData(active.time);
  active.analyser.getByteFrequencyData(active.freq);
  const level = levelFrom(active.time);
  const bands = bandsFrom(active.freq);

  // Lip-sync feed for the avatar (in-page).
  void browser.runtime
    .sendMessage({ type: OFFSCREEN.level, level, bands, phase: active.phase })
    .catch(() => undefined);

  if (active.phase === "recording" && tracker) {
    const reason = tracker.update(level, Date.now());
    if (reason) requestAutoStop(reason);
  }
}

/** Ask the background to stop; the recorder is left running on purpose. */
function requestAutoStop(reason: AutoStopReason): void {
  stopMeter();
  if (autoStopSignalled) return;
  autoStopSignalled = true;
  void browser.runtime.sendMessage({ type: OFFSCREEN.silence, reason }).catch(() => undefined);
}

/* --- recording ----------------------------------------------------------- */

/** Attach the lip-sync meter (and, in toggle mode, the silence tracker). */
function armAfterStart(autoStop: boolean): void {
  autoStopSignalled = false;
  const stream = recorder.stream;
  if (!stream) return;
  tracker = autoStop ? new SilenceTracker() : null;
  tracker?.start(Date.now());
  const context = getAudioContext();
  if (!context) return;
  startMeter(context.createMediaStreamSource(stream as MediaStream), "recording");
}

async function startRecording(options: { autoStop?: boolean } = {}): Promise<RecorderStartResult> {
  const result = await recorder.start({ autoStop: options.autoStop === true });
  if (result.ok) armAfterStart(options.autoStop === true);
  return result;
}

async function stopRecording(): Promise<{
  ok: boolean;
  base64?: string;
  mimeType?: string;
  error?: string;
}> {
  stopMeter();
  tracker = null;
  autoStopSignalled = true;
  return recorder.stop();
}

/* --- playback ------------------------------------------------------------ */

let audioElement: HTMLAudioElement | null = null;
let audioSource: MediaElementAudioSourceNode | null = null;
let currentUrl: string | null = null;

function getAudioElement(): HTMLAudioElement | null {
  if (audioElement) return audioElement;
  const element = document.createElement("audio");
  element.autoplay = false;
  document.body.appendChild(element);
  audioElement = element;
  const context = getAudioContext();
  if (context) {
    audioSource = context.createMediaElementSource(element);
    audioSource.connect(context.destination);
  }
  return element;
}

function releaseUrl(): void {
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
}

/** Play a base64 TTS clip and drive the lip-sync feed from it. */
async function playAudio(
  base64: string,
  mimeType: string,
  interrupt: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const element = getAudioElement();
  if (!element) return { ok: false, error: "audio unavailable" };
  if (interrupt) {
    element.pause();
    stopMeter();
  }
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    releaseUrl();
    // Blob + object URL: the CSP forbids data:/remote media; blob: is same-origin.
    const blob = new Blob([bytes], { type: mimeType || "audio/mpeg" });
    currentUrl = URL.createObjectURL(blob);
    element.src = currentUrl;
    element.onended = () => {
      stopMeter();
      releaseUrl();
    };
    const context = getAudioContext();
    if (context && context.state === "suspended") void context.resume().catch(() => undefined);
    await element.play();
    if (audioSource) startMeter(audioSource, "playback");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/* --- message bridge ------------------------------------------------------ */

browser.runtime.onMessage.addListener((raw: unknown) => {
  const message = raw as { type?: string; autoStop?: boolean; base64?: string; mimeType?: string; interrupt?: boolean } | undefined;
  if (!message) return undefined;

  if (message.type === OFFSCREEN.ping) return Promise.resolve({ ok: true });
  if (message.type === OFFSCREEN.start) {
    return startRecording({ autoStop: message.autoStop === true });
  }
  if (message.type === OFFSCREEN.stop) return stopRecording();
  if (message.type === OFFSCREEN.warm) {
    // Pre-warm so the first press is instant; stop immediately (permission cached).
    return startRecording({ autoStop: false }).then((result) => {
      if (result.ok) void stopRecording();
      return result;
    });
  }
  if (message.type === OFFSCREEN.play && typeof message.base64 === "string") {
    return playAudio(message.base64, message.mimeType ?? "audio/mpeg", message.interrupt !== false);
  }
  return undefined;
});

export {};
