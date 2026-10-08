import { describe, expect, it, vi } from "vitest";

import {
  classifyMicError,
  RecorderController,
  type MediaRecorderLike,
  type RecorderHost,
} from "../src/recorder.js";

class FakeRecorder implements MediaRecorderLike {
  state: "inactive" | "recording" | "paused" = "inactive";
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  readonly chunks: Uint8Array[];

  constructor(mimeType: string, chunks: Uint8Array[] = [new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])]) {
    this.mimeType = mimeType;
    this.chunks = chunks;
  }

  start(): void {
    this.state = "recording";
  }

  stop(): void {
    this.state = "inactive";
    for (const chunk of this.chunks) {
      this.ondataavailable?.({ data: new Blob([chunk as BlobPart]) });
    }
    this.onstop?.();
  }
}

interface Harness {
  host: RecorderHost;
  recorder: () => FakeRecorder | null;
  stopTrack: ReturnType<typeof vi.fn>;
  getUserMedia: ReturnType<typeof vi.fn>;
}

function harness(options: { chunks?: Uint8Array[]; reject?: Error } = {}): Harness {
  let instance: FakeRecorder | null = null;
  const stopTrack = vi.fn();
  const stream = { getTracks: () => [{ stop: stopTrack }] };
  const getUserMedia = vi.fn(async () => {
    if (options.reject) throw options.reject;
    return stream;
  });
  const host: RecorderHost = {
    isTypeSupported: (mime) => mime === "audio/webm;codecs=opus",
    getUserMedia,
    createRecorder: (_stream, mime) => {
      instance = new FakeRecorder(mime || "audio/webm", options.chunks);
      return instance;
    },
    encodeBase64: (bytes) => Buffer.from(bytes).toString("base64"),
  };
  return { host, recorder: () => instance, stopTrack, getUserMedia };
}

describe("recorder: start / stop", () => {
  it("opens the mic and starts recording", async () => {
    const h = harness();
    const controller = new RecorderController(h.host);

    const result = await controller.start();
    expect(result.ok).toBe(true);
    expect(h.getUserMedia).toHaveBeenCalledTimes(1);
    expect(controller.state).toBe("recording");
    expect(controller.mimeType).toBe("audio/webm;codecs=opus");
    expect(h.recorder()?.state).toBe("recording");
  });

  it("stops, collects the clip and releases the mic", async () => {
    const h = harness();
    const controller = new RecorderController(h.host);

    await controller.start();
    const result = await controller.stop();

    expect(result.ok).toBe(true);
    expect(result.base64).toBe(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]).toString("base64"));
    expect(result.mimeType).toBe("audio/webm;codecs=opus");
    expect(controller.state).toBe("idle");
    expect(h.stopTrack).toHaveBeenCalledTimes(1);
  });

  it("is idempotent: a second start reuses the running recorder", async () => {
    const h = harness();
    const controller = new RecorderController(h.host);

    await controller.start();
    await controller.start();
    expect(h.getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("reports an error when stopping while idle", async () => {
    const h = harness();
    const controller = new RecorderController(h.host);
    const result = await controller.stop();
    expect(result).toEqual({ ok: false, error: "not recording" });
  });

  it("reports an empty clip when nothing was captured", async () => {
    const h = harness({ chunks: [] });
    const controller = new RecorderController(h.host);
    await controller.start();
    const result = await controller.stop();
    expect(result.ok).toBe(false);
    expect(result.error).toBe("no audio captured");
  });

  it("surfaces a mic permission failure with a reason", async () => {
    const denied = new Error("denied");
    denied.name = "NotAllowedError";
    const h = harness({ reject: denied });
    const controller = new RecorderController(h.host);

    const result = await controller.start();
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("not-allowed");
  });

  it("carries the autoStop flag through", async () => {
    const h = harness();
    const controller = new RecorderController(h.host);
    await controller.start({ autoStop: true });
    expect(controller.autoStop).toBe(true);
  });
});

describe("recorder: mic error classification", () => {
  it("maps the common DOMException names", () => {
    const named = (name: string) => {
      const error = new Error(name);
      error.name = name;
      return classifyMicError(error);
    };
    expect(named("NotAllowedError")).toBe("not-allowed");
    expect(named("SecurityError")).toBe("not-allowed");
    expect(named("NotFoundError")).toBe("no-device");
    expect(named("NotReadableError")).toBe("device-busy");
    expect(classifyMicError(new Error("boom"))).toBe("unknown");
  });
});
