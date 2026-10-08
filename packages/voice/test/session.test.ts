import { describe, expect, it, vi } from "vitest";
import { BusEvents, createBus, type AvatarAPI, type BusEvent } from "@diggy/shared";

import { VoiceSession, type VoiceRecorder } from "../src/session.js";

const CLIP = "AQIDBA=="; // bytes [1,2,3,4]

function recorder(options: { startOk?: boolean; clip?: string | null } = {}) {
  const start = vi.fn(async (_opts?: { autoStop?: boolean }) =>
    options.startOk === false ? { ok: false, error: "no mic" } : { ok: true },
  );
  const stop = vi.fn(async () =>
    options.clip === null || options.clip === undefined
      ? { ok: false, error: "no audio" }
      : { ok: true, base64: options.clip, mimeType: "audio/webm" },
  );
  const recording: VoiceRecorder = { start, stop };
  return { recording, start, stop };
}

function avatar(): AvatarAPI {
  return {
    play: vi.fn(),
    say: vi.fn(),
    lookAt: vi.fn(),
    setExpression: vi.fn(),
    status: vi.fn(),
    setVisible: vi.fn(),
  };
}

describe("VoiceSession: a transcript reaches the bus", () => {
  it("records, transcribes and emits BusEvents.VoiceTranscript", async () => {
    const { recording } = recorder({ clip: CLIP });
    const transcribe = vi.fn(async (_audio: ArrayBuffer, _opts?: { mimeType?: string }) => "hello diggy");
    const bus = createBus({ source: "offscreen" });
    const heard: Array<BusEvent<{ text: string }>> = [];
    bus.on<{ text: string }>(BusEvents.VoiceTranscript, (event) => heard.push(event));

    const session = new VoiceSession({
      recorder: recording,
      transcribe,
      bus,
      minClipBase64Length: 0,
    });

    expect(await session.press()).toEqual({ ok: true });
    expect(session.state).toBe("listening");

    const result = await session.release();
    expect(result).toEqual({ ok: true, text: "hello diggy" });
    expect(session.state).toBe("idle");

    expect(heard).toHaveLength(1);
    expect(heard[0]?.payload).toEqual({ text: "hello diggy" });
    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(transcribe.mock.calls[0]?.[0]).toBeInstanceOf(ArrayBuffer);
  });

  it("drives the avatar + status for every phase", async () => {
    const { recording } = recorder({ clip: CLIP });
    const bus = createBus({ source: "offscreen" });
    const statuses: string[] = [];
    bus.on<{ text: string }>(BusEvents.AvatarStatus, (event) => statuses.push(event.payload.text));
    const face = avatar();

    const session = new VoiceSession({
      recorder: recording,
      transcribe: async () => "hi",
      bus,
      avatar: face,
      minClipBase64Length: 0,
    });

    await session.press();
    await session.release();

    expect(face.play).toHaveBeenCalledWith("listening");
    expect(statuses).toContain("Listening…");
    expect(statuses).toContain("Transcribing…");
  });

  it("emits nothing when the clip is empty", async () => {
    const { recording } = recorder({ clip: null });
    const bus = createBus({ source: "offscreen" });
    const heard: BusEvent[] = [];
    bus.on(BusEvents.VoiceTranscript, (event) => heard.push(event));
    const transcribe = vi.fn(async () => "should not run");

    const session = new VoiceSession({ recorder: recording, transcribe, bus });
    await session.press();
    const result = await session.release();

    expect(result.ok).toBe(false);
    expect(heard).toHaveLength(0);
    expect(transcribe).not.toHaveBeenCalled();
  });
});

describe("VoiceSession: controls", () => {
  it("refuses to listen when voice is disabled (opt-in)", async () => {
    const { recording } = recorder();
    const session = new VoiceSession({ recorder: recording, transcribe: async () => "x", enabled: false });
    expect(await session.press()).toEqual({ ok: false, error: "voice-disabled" });
  });

  it("reports a release with no recording", async () => {
    const { recording } = recorder();
    const session = new VoiceSession({ recorder: recording, transcribe: async () => "x" });
    expect(await session.release()).toEqual({ ok: false, error: "not-listening" });
  });

  it("toggles press then release", async () => {
    const { recording, start, stop } = recorder({ clip: CLIP });
    const session = new VoiceSession({
      recorder: recording,
      transcribe: async () => "hi",
      minClipBase64Length: 0,
    });

    await session.toggle();
    expect(start).toHaveBeenCalledTimes(1);
    await session.toggle();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("auto-stop on silence ends the turn", async () => {
    const { recording } = recorder({ clip: CLIP });
    const bus = createBus({ source: "offscreen" });
    const heard: BusEvent[] = [];
    bus.on(BusEvents.VoiceTranscript, (event) => heard.push(event));
    const session = new VoiceSession({
      recorder: recording,
      transcribe: async () => "auto stopped",
      bus,
      minClipBase64Length: 0,
    });

    await session.press();
    const result = await session.onSilence("silence");
    expect(result).toEqual({ ok: true, text: "auto stopped" });
    expect(heard).toHaveLength(1);
  });

  it("speaks a reply through the avatar and TTS engine", async () => {
    const { recording } = recorder();
    const face = avatar();
    const speak = vi.fn(async (_text: string) => {});
    const session = new VoiceSession({
      recorder: recording,
      transcribe: async () => "x",
      avatar: face,
      tts: { speak, cancel: vi.fn() },
    });

    await session.speak("Here is your summary.");
    expect(face.say).toHaveBeenCalledWith("Here is your summary.", "speaking");
    expect(speak).toHaveBeenCalledWith("Here is your summary.");
    expect(session.state).toBe("idle");
  });
});
