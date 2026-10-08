/**
 * Speech-to-text wrapper over the shared `Provider` contract.
 *
 * // INTERFACE FOR INTEGRATION
 * type Transcriber = (audio: ArrayBuffer, opts?: { mimeType?: string; language?: string }) => Promise<string>;
 * class TranscriptionError extends Error {}
 * function createTranscriber(provider: Provider, opts?: { language?: string }): Transcriber;
 * function decodeBase64(base64: string): ArrayBuffer;
 * // END INTERFACE FOR INTEGRATION
 *
 * The extension never holds a provider key: it sends the recorded clip to the
 * brain/provider layer, which owns the Groq `whisper-large-v3` call. This wrapper
 * is the one place that reaches for `Provider.transcribe`.
 */
import type { Provider } from "@diggy/shared";

/** Raised when transcription is impossible or the provider fails. */
export class TranscriptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranscriptionError";
  }
}

export type Transcriber = (
  audio: ArrayBuffer,
  opts?: { mimeType?: string; language?: string },
) => Promise<string>;

/** Decode a base64 clip (the offscreen wire format) into bytes. */
export function decodeBase64(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

/**
 * Build a {@link Transcriber} bound to a provider.
 *
 * Throws {@link TranscriptionError} when the provider does not implement
 * `transcribe` (so the host can fail over instead of sending a bad request).
 */
export function createTranscriber(
  provider: Provider,
  options: { language?: string } = {},
): Transcriber {
  const transcribe = provider.transcribe?.bind(provider);
  if (!transcribe) {
    throw new TranscriptionError(`Provider "${provider.id}" does not support transcription`);
  }
  return async (audio, opts) => {
    const language = opts?.language ?? options.language;
    const text = await transcribe(audio, language ? { language } : undefined);
    return (text ?? "").trim();
  };
}
