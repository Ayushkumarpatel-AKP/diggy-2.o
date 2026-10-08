import { describe, expect, it, vi } from "vitest";

import { createBus } from "./bus.js";
import { BusEvents } from "./contracts/bus.js";
import type { BusEvent } from "./contracts/bus.js";

describe("createBus", () => {
  it("delivers emitted payloads to subscribers of the matching type", () => {
    const bus = createBus({ source: "content", now: () => 1234 });
    const handler = vi.fn();

    bus.on<{ text: string }>(BusEvents.VoiceTranscript, handler);
    bus.emit(BusEvents.VoiceTranscript, { text: "hello diggy" });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      type: BusEvents.VoiceTranscript,
      source: "content",
      payload: { text: "hello diggy" },
      at: 1234,
    });
  });

  it("does not deliver events to unrelated type handlers", () => {
    const bus = createBus();
    const handler = vi.fn();

    bus.on(BusEvents.MonitorEvent, handler);
    bus.emit(BusEvents.AvatarState, { state: "idle" });

    expect(handler).not.toHaveBeenCalled();
  });

  it("stops delivering after unsubscribe", () => {
    const bus = createBus();
    const handler = vi.fn();

    const off = bus.on(BusEvents.ActivityRecord, handler);
    bus.emit(BusEvents.ActivityRecord, { kind: "summary" });
    off();
    bus.emit(BusEvents.ActivityRecord, { kind: "summary" });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("relays events through an optional transport", () => {
    const received: unknown[] = [];
    let deliver: ((event: BusEvent) => void) | undefined;
    const transport = {
      broadcast: vi.fn(),
      subscribe: (handler: (event: BusEvent) => void) => {
        deliver = handler;
        return () => {};
      },
    };

    const bus = createBus({ transport });
    bus.on(BusEvents.AvatarStatus, (event) => received.push(event.payload));

    deliver?.({
      type: BusEvents.AvatarStatus,
      source: "background",
      payload: { text: "Monitoring…" },
      at: 42,
    });
    bus.emit(BusEvents.AvatarState, { state: "thinking" });

    expect(received).toEqual([{ text: "Monitoring…" }]);
    expect(transport.broadcast).toHaveBeenCalledOnce();
  });
});
