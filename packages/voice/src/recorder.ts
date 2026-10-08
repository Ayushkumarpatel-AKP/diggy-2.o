/**
 * Microphone recorder core — the proven `getUserMedia` + `MediaRecorder` sequence,
 * made testable by pushing every browser API behind an injectable {@link RecorderHost}.
 *
 * // INTERFACE FOR INTEGRATION
 * interface MediaStreamLike { getTracks(): Array<{ stop(): void }> }
 * interface MediaRecorderLike {
 *   readonly state: "inactive" | "recording" | "paused";
 *   readonly mimeType: string;
 *   start(timeslice?: number): void;
 *   stop(): void;
 *   ondataavailable: ((e: { data: Blob }) => void) | null;
 *   onstop: (() => void) | null;
 * }
 * interface RecorderHost {
 *   isTypeSupported(mimeType: string): boolean;
 *   getUserMedia(audio): Promise<MediaStreamLike>;
 *   createRecorder(stream, mimeType): MediaRecorderLike;
 *   encodeBase64(bytes: Uint8Array): string;
 * }
 * function createDomRecorderHost(): RecorderHost;
 * function classifyMicError(error: unknown): MicErrorReason;
 * const PREFERRED_MIME_TYPES: readonly string[];
 * class RecorderController {
 *   constructor(host: RecorderHost, options?);
 *   readonly state: "idle" | "recording";
 *   readonly mimeType: string | null;
 *   readonly stream: MediaStreamLike | null;
 *   start(options?: { autoStop?: boolean }): Promise<RecorderStartResult>; // { ok, error?, reason? }
 *   stop(): Promise<RecorderStopResult>;   // { ok, error?, base64?, mimeType? }
 * }
 * // END INTERFACE FOR INTEGRATION
 *
 * Audio is never logged and never persisted: `stop()` hands back a base64 clip and
 * the controller immediately releases the mic and drops its chunks.
 */
import type { MicErrorReason } from "./protocol.js";

export interface MediaStreamTrackLike {
  stop(): void;
}

export interface MediaStreamLike {
  getTracks(): MediaStreamTrackLike[];
}

export interface MediaRecorderLike {
  readonly state: "inactive" | "recording" | "paused";
  readonly mimeType: string;
  start(timeslice?: number): void;
  stop(): void;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
}

export interface AudioConstraints {
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
}

/** Everything the controller needs from the environment. */
export interface RecorderHost {
  isTypeSupported(mimeType: string): boolean;
  getUserMedia(audio: AudioConstraints): Promise<MediaStreamLike>;
  createRecorder(stream: MediaStreamLike, mimeType: string): MediaRecorderLike;
  encodeBase64(bytes: Uint8Array): string;
}

export interface RecorderStartResult {
  ok: boolean;
  error?: string;
  reason?: MicErrorReason;
}

export interface RecorderStopResult {
  ok: boolean;
  error?: string;
  base64?: string;
  mimeType?: string;
}

/** Codec preference order (opus/WebM first, mp4 for Safari, WebM last resort). */
export const PREFERRED_MIME_TYPES: readonly string[] = [
  "audio/webm;codecs=opus",
  "audio/mp4",
  "audio/webm",
];

/** `getUserMedia` failure → the reason the host needs to act on. */
export function classifyMicError(error: unknown): MicErrorReason {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "not-allowed";
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return "no-device";
  if (name === "NotReadableError" || name === "TrackStartError") return "device-busy";
  return "unknown";
}

function encodeBase64Dom(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let index = 0; index < bytes.length; index += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK));
  }
  return btoa(binary);
}

/** The real browser host (mic + MediaRecorder + btoa). */
export function createDomRecorderHost(): RecorderHost {
  return {
    isTypeSupported(mimeType: string): boolean {
      return typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mimeType);
    },
    getUserMedia(audio: AudioConstraints): Promise<MediaStreamLike> {
      return navigator.mediaDevices.getUserMedia({ audio }) as Promise<MediaStreamLike>;
    },
    createRecorder(stream: MediaStreamLike, mimeType: string): MediaRecorderLike {
      return new MediaRecorder(stream as MediaStream, {
        mimeType: mimeType || undefined,
      }) as unknown as MediaRecorderLike;
    },
    encodeBase64: encodeBase64Dom,
  };
}

export interface RecorderOptions {
  /** Codec candidates, in preference order. */
  mimeTypes?: readonly string[];
  /** Mic constraints. */
  audio?: AudioConstraints;
}

/**
 * Records a single clip on demand: `start()` opens the mic, `stop()` closes it and
 * resolves the captured audio as base64 (base64 because `runtime.sendMessage`
 * cannot carry an `ArrayBuffer`).
 */
export class RecorderController {
  private readonly _host: RecorderHost;
  private readonly _mimeTypes: readonly string[];
  private readonly _audio: AudioConstraints;
  private _stream: MediaStreamLike | null = null;
  private _recorder: MediaRecorderLike | null = null;
  private _chunks: Blob[] = [];
  private _autoStop = false;
  private _mimeType: string | null = null;

  constructor(host: RecorderHost, options: RecorderOptions = {}) {
    this._host = host;
    this._mimeTypes = options.mimeTypes ?? PREFERRED_MIME_TYPES;
    this._audio = options.audio ?? {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };
  }

  get state(): "idle" | "recording" {
    return this._recorder && this._recorder.state === "recording" ? "recording" : "idle";
  }

  get mimeType(): string | null {
    return this._mimeType;
  }

  /** The live mic stream, so the host can attach a level analyser. */
  get stream(): MediaStreamLike | null {
    return this._stream;
  }

  /** Whether the caller asked for silence auto-stop (toggle mode). */
  get autoStop(): boolean {
    return this._autoStop;
  }

  private pickMimeType(): string {
    for (const candidate of this._mimeTypes) {
      if (this._host.isTypeSupported(candidate)) return candidate;
    }
    return "";
  }

  async start(options: { autoStop?: boolean } = {}): Promise<RecorderStartResult> {
    if (this._recorder) return { ok: true };

    let stream: MediaStreamLike;
    try {
      stream = await this._host.getUserMedia(this._audio);
    } catch (error) {
      this.cleanup();
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        reason: classifyMicError(error),
      };
    }

    try {
      const mimeType = this.pickMimeType();
      this._stream = stream;
      this._mimeType = mimeType || null;
      this._chunks = [];
      this._autoStop = options.autoStop === true;
      this._recorder = this._host.createRecorder(stream, mimeType);
      this._recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) this._chunks.push(event.data);
      };
      this._recorder.start();
    } catch (error) {
      this.cleanup();
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        reason: "unknown",
      };
    }

    return { ok: true };
  }

  stop(): Promise<RecorderStopResult> {
    return new Promise((resolve) => {
      const active = this._recorder;
      if (!active) {
        resolve({ ok: false, error: "not recording" });
        return;
      }
      active.onstop = async () => {
        try {
          const type = active.mimeType || this._mimeType || "audio/webm";
          const blob = new Blob(this._chunks, { type });
          if (blob.size === 0) {
            this.cleanup();
            resolve({ ok: false, error: "no audio captured" });
            return;
          }
          const bytes = new Uint8Array(await blob.arrayBuffer());
          const base64 = this._host.encodeBase64(bytes);
          this.cleanup();
          resolve({ ok: true, base64, mimeType: type });
        } catch (error) {
          this.cleanup();
          resolve({ ok: false, error: error instanceof Error ? error.message : String(error) });
        }
      };
      try {
        active.stop();
      } catch (error) {
        this.cleanup();
        resolve({ ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    });
  }

  /** Stop and drop everything without producing a clip. */
  cancel(): void {
    try {
      if (this._recorder && this._recorder.state !== "inactive") this._recorder.stop();
    } catch {
      /* already gone */
    }
    this.cleanup();
  }

  private cleanup(): void {
    this._stream?.getTracks().forEach((track) => track.stop());
    this._stream = null;
    this._recorder = null;
    this._chunks = [];
    this._autoStop = false;
    this._mimeType = null;
  }
}
