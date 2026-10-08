import { describe, expect, it } from "vitest";
import type { AvatarState } from "@diggy/shared";

import { AVATAR_CLIPS } from "../src/clips.js";
import {
  AVATAR_STATES,
  AvatarStateMachine,
  MAX_CROSSFADE_SECONDS,
  MIN_CROSSFADE_SECONDS,
  STATE_PROFILES,
  STATE_PRIORITY,
  clipIdForState,
  isAvatarState,
  resolveClip,
} from "../src/state-machine.js";

const CONTRACT_STATES: AvatarState[] = [
  "idle",
  "blink",
  "breathing",
  "listening",
  "thinking",
  "speaking",
  "walk",
  "happy",
  "success",
  "warning",
  "sleep",
  "celebration",
];

describe("the 12-state machine", () => {
  it("declares exactly the 12 contract states", () => {
    expect(AVATAR_STATES).toHaveLength(12);
    expect(new Set(AVATAR_STATES).size).toBe(12);
    expect([...AVATAR_STATES].sort()).toEqual([...CONTRACT_STATES].sort());
  });

  it("maps every state to a real clip and a 0.2–0.35s cross-fade", () => {
    const clipIds = new Set(AVATAR_CLIPS.map((clip) => clip.id));
    for (const state of AVATAR_STATES) {
      const profile = STATE_PROFILES[state];
      expect(profile, `profile for ${state}`).toBeDefined();
      expect(clipIds.has(profile.clip), `${state} -> ${profile.clip}`).toBe(true);
      expect(profile.crossFade).toBeGreaterThanOrEqual(MIN_CROSSFADE_SECONDS);
      expect(profile.crossFade).toBeLessThanOrEqual(MAX_CROSSFADE_SECONDS);
      expect(clipIdForState(state)).toBe(profile.clip);
      expect(resolveClip(state)).toBe(profile.clip);
      expect(typeof STATE_PRIORITY[state]).toBe("number");
    }
  });

  it("realises the exact clip mapping from the brief", () => {
    expect(clipIdForState("idle")).toBe("standing-idle");
    expect(clipIdForState("walk")).toBe("walking");
    expect(clipIdForState("happy")).toBe("happy-walk");
    expect(clipIdForState("celebration")).toBe("clapping");
    expect(clipIdForState("success")).toBe("clapping");
    expect(clipIdForState("warning")).toBe("angry-point");
    expect(clipIdForState("listening")).toBe("standing-greeting");
    expect(clipIdForState("thinking")).toBe("looking");
    expect(clipIdForState("speaking")).toBe("looking");
  });

  it("loads all 8 shipped clips (brief says 9; disk ships 8)", () => {
    expect(AVATAR_CLIPS).toHaveLength(8);
  });
});

describe("missing clips degrade without throwing", () => {
  it("falls back to standing-idle when the preferred clip is absent", () => {
    expect(resolveClip("celebration", ["walking", "standing-idle"])).toBe("standing-idle");
    expect(resolveClip("warning", new Set(["standing-idle", "walking"]))).toBe("standing-idle");
    // The fallback itself must also be absent to get null.
    expect(resolveClip("celebration", ["walking"])).toBeNull();
  });

  it("returns null (never throws) when nothing is available", () => {
    expect(resolveClip("celebration", [])).toBeNull();
    expect(resolveClip("warning", [])).toBeNull();
    expect(resolveClip("walk", new Set<string>())).toBeNull();
  });

  it("guards unknown states at runtime", () => {
    expect(isAvatarState("idle")).toBe(true);
    expect(isAvatarState("nope")).toBe(false);
    expect(isAvatarState(42)).toBe(false);
  });
});

describe("priority + auto-return", () => {
  it("a lower priority never interrupts a higher one", () => {
    const machine = new AvatarStateMachine();
    expect(machine.play("celebration")).toBe(true);
    expect(machine.play("walk")).toBe(false);
    expect(machine.play("idle")).toBe(false);
    expect(machine.state).toBe("celebration");
  });

  it("allows equal-or-higher priority transitions", () => {
    const machine = new AvatarStateMachine();
    machine.play("walk");
    expect(machine.play("warning")).toBe(true);
    expect(machine.state).toBe("warning");
    expect(machine.play("success")).toBe(true); // equal priority
    expect(machine.state).toBe("success");
  });

  it("always returns transient states to idle", () => {
    const transient: AvatarState[] = [
      "listening",
      "thinking",
      "speaking",
      "happy",
      "success",
      "warning",
      "celebration",
    ];
    for (const state of transient) {
      const machine = new AvatarStateMachine({ initialState: "idle" });
      machine.play(state);
      expect(machine.state, `should enter ${state}`).toBe(state);
      machine.update(5); // default auto-return is 4s
      expect(machine.state, `should return to idle from ${state}`).toBe("idle");
    }
  });

  it("does not auto-return steady states", () => {
    const walk = new AvatarStateMachine();
    walk.play("walk");
    walk.update(30);
    expect(walk.state).toBe("walk");

    const sleep = new AvatarStateMachine({ initialState: "sleep" });
    sleep.update(30);
    expect(sleep.state).toBe("sleep");
  });

  it("notifies on change and clamps explicit cross-fades", () => {
    const seen: AvatarState[] = [];
    const machine = new AvatarStateMachine({ onStateChange: (state) => seen.push(state) });
    machine.crossFadeTo("warning", 5);
    expect(machine.crossFadeSeconds).toBeLessThanOrEqual(MAX_CROSSFADE_SECONDS);
    machine.crossFadeTo("celebration", 0.01);
    expect(machine.crossFadeSeconds).toBeGreaterThanOrEqual(MIN_CROSSFADE_SECONDS);
    expect(seen).toEqual(["warning", "celebration"]);
    expect(machine.previous).toBe("warning");
  });
});
