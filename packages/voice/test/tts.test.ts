import { describe, expect, it, vi } from "vitest";
import type { Provider } from "@diggy/shared";

import {
  createBrowserTts,
  createProviderTts,
  type AudioSink,
  type SpeechSynthesisLike,
  type SpeechSynthesisUtteranceLike,
} from "../src/tts.js";

function fakeSynth(behaviour: "end" | "error" = "end"): SpeechSynthesisLike & {
  utterances: SpeechSynthesisUtteranceLike[];
  canceled: boolean;
} {
  return {
    utterances: [],
    canceled: false,
    speaking: false,
    speak(utterance) {
      this.utterances.push(utterance);
      if (behaviour === "error") utterance.onerror?.(new Error("tts failed"));
      else utterance.onend?.();
    },
    cancel() {
      this.canceled = true;
    },
  };
}

function provider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: "openai",
    label: "OpenAI",
    chat: async () => ({ text: "", toolCalls: [], finishReason: "stop" }),
    ...overrides,
  };
}

/** Node has no `SpeechSynthesisUtterance`, so tests inject a plain factory. */
const utteranceFactory = (text: string): SpeechSynthesisUtteranceLike => ({ text });
const browser = (synth: SpeechSynthesisLike) => createBrowserTts(synth, { utteranceFactory });

describe("createBrowserTts", () => {
  it("speaks the text and resolves when the utterance ends", async () => {
    const synth = fakeSynth("end");
    await browser(synth).speak("  hello  ");
    expect(synth.utterances).toHaveLength(1);
    expect(synth.utterances[0]?.text).toBe("hello");
  });

  it("does nothing for blank text", async () => {
    const synth = fakeSynth();
    await browser(synth).speak("   ");
    expect(synth.utterances).toHaveLength(0);
  });

  it("rejects when the synthesizer errors (so callers can fall back to text)", async () => {
    const synth = fakeSynth("error");
    await expect(browser(synth).speak("hi")).rejects.toThrow("tts failed");
  });

  it("cancels", () => {
    const synth = fakeSynth();
    browser(synth).cancel();
    expect(synth.canceled).toBe(true);
  });
});

describe("createProviderTts", () => {
  it("plays the provider clip through the sink", async () => {
    const audio = new ArrayBuffer(16);
    const speak = vi.fn(async (_text: string, _opts?: { voice?: string }) => ({ audio, mimeType: "audio/mpeg" }));
    const play = vi.fn(async (_audio: ArrayBuffer, _mimeType: string) => {});
    const sink: AudioSink = { play };

    const engine = createProviderTts(provider({ speak }), sink);
    await engine.speak("hello");
    expect(speak).toHaveBeenCalledWith("hello", undefined);
    expect(play).toHaveBeenCalledWith(audio, "audio/mpeg");
  });

  it("throws when the provider cannot speak", () => {
    expect(() => createProviderTts(provider(), { play: async () => {} })).toThrow();
  });

  it("stops the sink on cancel", () => {
    const stop = vi.fn();
    const sink: AudioSink = { play: async () => {}, stop };
    const engine = createProviderTts(provider({ speak: async () => ({ audio: new ArrayBuffer(1), mimeType: "audio/mpeg" }) }), sink);
    engine.cancel();
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
