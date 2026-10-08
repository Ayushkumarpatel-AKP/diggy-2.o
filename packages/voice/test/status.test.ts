import { describe, expect, it, vi } from "vitest";
import { BusEvents, createBus, type BusEvent } from "@diggy/shared";

import {
  announce,
  emitAvatarState,
  emitAvatarStatus,
  formatThinking,
  THINKING_MESSAGES,
  thinkingMessage,
} from "../src/status.js";

describe("thinking / status copy", () => {
  it("has a line for every phase in the brief", () => {
    expect(Object.values(THINKING_MESSAGES)).toEqual([
      "Reading page…",
      "Looking for updates…",
      "Monitoring website…",
      "Filling form…",
      "Analyzing repository…",
      "Searching web…",
    ]);
    expect(thinkingMessage("monitoringWebsite")).toBe("Monitoring website…");
  });

  it("prefixes 💭 once, for surfaces that render raw text", () => {
    expect(formatThinking("Reading page…")).toBe("💭 Reading page…");
    expect(formatThinking("💭 Reading page…")).toBe("💭 Reading page…");
  });

  it("emits BusEvents.AvatarStatus with a text payload", () => {
    const bus = createBus({ source: "offscreen" });
    const seen: Array<BusEvent<{ text: string }>> = [];
    bus.on<{ text: string }>(BusEvents.AvatarStatus, (event) => seen.push(event));

    emitAvatarStatus(bus, "Monitoring website…");
    expect(seen[0]?.payload).toEqual({ text: "Monitoring website…" });
  });

  it("emits BusEvents.AvatarState with a state payload", () => {
    const bus = createBus({ source: "offscreen" });
    const seen: Array<BusEvent<{ state: string }>> = [];
    bus.on<{ state: string }>(BusEvents.AvatarState, (event) => seen.push(event));

    emitAvatarState(bus, "thinking");
    expect(seen[0]?.payload).toEqual({ state: "thinking" });
  });

  it("announce routes to both the avatar and the bus", () => {
    const bus = createBus({ source: "offscreen" });
    const seen: BusEvent[] = [];
    bus.on(BusEvents.AvatarStatus, (event) => seen.push(event));
    const status = vi.fn();

    announce({ bus, avatar: { status } }, "Analyzing repository…");
    expect(status).toHaveBeenCalledWith("Analyzing repository…");
    expect(seen).toHaveLength(1);
  });

  it("announce tolerates a missing bus or avatar", () => {
    expect(() => announce({}, "Searching web…")).not.toThrow();
  });
});
