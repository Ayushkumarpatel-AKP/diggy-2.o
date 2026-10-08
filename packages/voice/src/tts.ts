/**
 * Text-to-speech playback — two engines behind one seam.
 *
 * // INTERFACE FOR INTEGRATION
 * interface TtsEngine { speak(text, opts?): Promise<void>; cancel(): void }
 * interface SpeechSynthesisLike { speak(u); cancel(); readonly speaking: boolean }
 * interface SpeechSynthesisUtteranceLike { text; lang?; rate?; pitch?; volume?; onend?; onerror? }
 * function createBrowserTts(synth, options?): TtsEngine;        // no network
 * interface AudioSink { play(audio: ArrayBuffer, mimeType: string): Promise<void>; stop?(): void }
 * function createProviderTts(provider, sink, options?): TtsEngine;  // Provider.speak
 * // END INTERFACE FOR INTEGRATION
 *
 * The browser engine (`SpeechSynthesis`) is the default: it never touches the
 * network and matches the "replies are spoken with the browser's own voice"
 * behaviour. The provider engine is for hosts that have a server-side TTS.
 */
import type { Provider } from "@diggy/shared";

export interface TtsEngine {
  speak(text: string, opts?: { voice?: string }): Promise<void>;
  cancel(): void;
}

export interface SpeechSynthesisUtteranceLike {
  text: string;
  lang?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  voice?: unknown;
  onend?: (() => void) | null;
  onerror?: ((event?: unknown) => void) | null;
}

export interface SpeechSynthesisLike {
  speak(utterance: SpeechSynthesisUtteranceLike): void;
  cancel(): void;
  readonly speaking: boolean;
}

export interface BrowserTtsOptions {
  /** Build an utterance (defaults to the DOM `SpeechSynthesisUtterance`). */
  utteranceFactory?: (text: string) => SpeechSynthesisUtteranceLike;
  lang?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
}

function defaultUtteranceFactory(text: string): SpeechSynthesisUtteranceLike {
  return new SpeechSynthesisUtterance(text) as unknown as SpeechSynthesisUtteranceLike;
}

/**
 * Speak through the browser's built-in synthesizer.
 *
 * Rejects when the synthesizer reports an error, so callers can fall back to
 * showing the text; resolves on `onend`.
 */
export function createBrowserTts(
  synth: SpeechSynthesisLike,
  options: BrowserTtsOptions = {},
): TtsEngine {
  const factory = options.utteranceFactory ?? defaultUtteranceFactory;
  return {
    speak(text, opts) {
      const clean = text.trim();
      if (!clean) return Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        const utterance = factory(clean);
        if (options.lang) utterance.lang = options.lang;
        if (options.rate != null) utterance.rate = options.rate;
        if (options.pitch != null) utterance.pitch = options.pitch;
        if (options.volume != null) utterance.volume = options.volume;
        if (opts?.voice) utterance.voice = opts.voice;
        utterance.onend = () => resolve();
        utterance.onerror = (event) => reject(event instanceof Error ? event : new Error("tts failed"));
        synth.speak(utterance);
      });
    },
    cancel() {
      synth.cancel();
    },
  };
}

/** Where provider-synthesized audio is played (an `<audio>` sink, etc.). */
export interface AudioSink {
  play(audio: ArrayBuffer, mimeType: string): Promise<void>;
  stop?(): void;
}

export interface ProviderTtsOptions {
  voice?: string;
  /** MIME type passed to the sink; defaults to the provider's own. */
  mimeType?: string;
}

/**
 * Speak through a provider's `speak()` (server-side TTS), playing the returned
 * clip through the injected sink.
 */
export function createProviderTts(
  provider: Provider,
  sink: AudioSink,
  options: ProviderTtsOptions = {},
): TtsEngine {
  const speak = provider.speak?.bind(provider);
  if (!speak) {
    throw new Error(`Provider "${provider.id}" does not support text-to-speech`);
  }
  return {
    async speak(text, opts) {
      const clean = text.trim();
      if (!clean) return;
      const voice = opts?.voice ?? options.voice;
      const result = await speak(clean, voice ? { voice } : undefined);
      await sink.play(result.audio, options.mimeType ?? result.mimeType);
    },
    cancel() {
      sink.stop?.();
    },
  };
}
