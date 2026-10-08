import { describe, expect, it, vi } from "vitest";
import type { Provider } from "@diggy/shared";

import { createTranscriber, decodeBase64, TranscriptionError } from "../src/stt.js";

function provider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: "groq",
    label: "Groq",
    chat: async () => ({ text: "", toolCalls: [], finishReason: "stop" }),
    ...overrides,
  };
}

describe("createTranscriber", () => {
  it("calls Provider.transcribe and trims the text", async () => {
    const transcribe = vi.fn(async (_audio: ArrayBuffer, _opts?: { language?: string }) => "  hello world  ");
    const run = createTranscriber(provider({ transcribe }));

    const text = await run(new ArrayBuffer(8), { mimeType: "audio/webm" });
    expect(text).toBe("hello world");
    expect(transcribe).toHaveBeenCalledTimes(1);
  });

  it("passes a language through", async () => {
    const transcribe = vi.fn(async (_audio: ArrayBuffer, _opts?: { language?: string }) => "namaste");
    const run = createTranscriber(provider({ transcribe }), { language: "hi" });
    await run(new ArrayBuffer(4));
    expect(transcribe).toHaveBeenCalledWith(expect.any(ArrayBuffer), { language: "hi" });
  });

  it("throws when the provider cannot transcribe", () => {
    expect(() => createTranscriber(provider())).toThrow(TranscriptionError);
  });

  it("returns an empty string for silence", async () => {
    const run = createTranscriber(provider({ transcribe: async () => "   " }));
    expect(await run(new ArrayBuffer(4))).toBe("");
  });
});

describe("decodeBase64", () => {
  it("round-trips bytes", () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255]);
    const base64 = Buffer.from(bytes).toString("base64");
    const decoded = new Uint8Array(decodeBase64(base64));
    expect([...decoded]).toEqual([...bytes]);
  });
});
