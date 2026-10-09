import { describe, expect, it } from "vitest";
import type { AvatarState } from "@diggy/shared";

import { AVATAR_ANIMATIONS } from "../src/animations.js";
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
  "entry",
  "stretch",
  "exit",
];

describe("the avatar state machine", () => {
  it("declares exactly the contract states", () => {
    expect(AVATAR_STATES).toHaveLength(15);
    expect(new Set(AVATAR_STATES).size).toBe(15);
    expect([...AVATAR_STATES].sort()).toEqual([...CONTRACT_STATES].sort());
  });

  it("maps every state to a real clip and a 0.2–0.35s cross-fade", () => {
    const clipIds = new Set(AVATAR_ANIMATIONS.map((animation) => animation.id));
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

  it("maps the states onto the shipped VRMA animations", () => {
    expect(clipIdForState("idle")).toBe("relax");
    expect(clipIdForState("listening")).toBe("lookaround");
    expect(clipIdForState("thinking")).toBe("thinking");
    expect(clipIdForState("speaking")).toBe("blush");
    expect(clipIdForState("happy")).toBe("blush");
    expect(clipIdForState("success")).toBe("clapping");
    expect(clipIdForState("celebration")).toBe("jump");
    expect(clipIdForState("warning")).toBe("surprised");
    expect(clipIdForState("sleep")).toBe("sleepy");
    expect(clipIdForState("exit")).toBe("goodbye");
  });

  it("ships all 11 VRMA animations", () => {
    expect(AVATAR_ANIMATIONS).toHaveLength(11);
    for (const animation of AVATAR_ANIMATIONS) {
      expect(animation.file.endsWith(".vrma"), animation.file).toBe(true);
    }
  });
});

describe("missing clips degrade without throwing", () => {
  it("falls back to relax when the preferred animation is absent", () => {
    expect(resolveClip("celebration", ["blush", "relax"])).toBe("relax");
    expect(resolveClip("warning", new Set(["relax", "thinking"]))).toBe("relax");
    // The fallback itself must also be absent to get null.
    expect(resolveClip("celebration", ["blush"])).toBeNull();
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
