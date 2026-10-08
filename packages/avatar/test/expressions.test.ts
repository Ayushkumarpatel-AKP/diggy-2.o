import { describe, expect, it } from "vitest";
import type { AvatarState } from "@diggy/shared";

import {
  EXPRESSION_FOR_STATE,
  EXPRESSION_NAMES,
  EXPRESSION_PRESETS,
  MOTION_EXPRESSION_PROFILES,
  applyExpressionToMesh,
  applyExpressionToMeshes,
  blendExpression,
  collectExpressionNames,
  normalizeExpression,
  presetForClip,
  presetForState,
} from "../src/expressions.js";

describe("FBX expression presets (ported from app.js)", () => {
  it("ports the preset values verbatim", () => {
    expect(EXPRESSION_PRESETS.happy).toEqual({ Smile: 0.85, Smile2: 0.45, Smile3: 0.25 });
    expect(EXPRESSION_PRESETS.excited).toEqual({ Smile: 0.95, Smile2: 0.7, Surprised: 0.35, Up: 0.25 });
    expect(EXPRESSION_PRESETS.sleepy).toEqual({ Sad: 0.35, Sad2: 0.2, Blink: 0.75, Down: 0.25 });
    expect(EXPRESSION_NAMES).toHaveLength(18);
    expect(MOTION_EXPRESSION_PROFILES["standing-idle"]).toBe("smug");
    expect(MOTION_EXPRESSION_PROFILES["angry-point"]).toBe("angry");
    expect(presetForClip("clapping")).toEqual(EXPRESSION_PRESETS.happy);
    expect(presetForClip("does-not-exist")).toBeNull();
  });

  it("every state resolves to a preset or a deliberately blank face", () => {
    const states: AvatarState[] = [
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
    for (const state of states) {
      expect(() => presetForState(state)).not.toThrow();
      expect(EXPRESSION_FOR_STATE[state]).toBeDefined();
    }
    expect(presetForState("blink")).toBeNull();
    expect(presetForState("warning")).toEqual(EXPRESSION_PRESETS.angry);
  });
});

describe("applying expressions to a rig with missing morphs", () => {
  it("applies present morphs and skips unknown ones without throwing", () => {
    const influences = [0];
    const mesh = { morphTargetDictionary: { Smile: 0 }, morphTargetInfluences: influences };
    expect(() => applyExpressionToMesh(mesh, { Smile: 1, Angry: 1, Unknown: 1 })).not.toThrow();
    expect(influences[0]).toBe(1);
    expect(applyExpressionToMesh(mesh, { Smile: 1, Angry: 1 })).toBe(1);
  });

  it("skips out-of-range indices and empty dictionaries", () => {
    expect(applyExpressionToMesh({}, { Smile: 1 })).toBe(0);
    expect(
      applyExpressionToMesh({ morphTargetDictionary: { Smile: 5 }, morphTargetInfluences: [0] }, { Smile: 1 }),
    ).toBe(0);
    expect(applyExpressionToMeshes([], { Smile: 1 })).toBe(0);
  });

  it("blends toward the target and normalises unknown names", () => {
    const blended = blendExpression(normalizeExpression({ Smile: 1 }), EXPRESSION_PRESETS.happy, 0.5);
    expect(blended.Smile).toBeCloseTo(1 + (0.85 - 1) * 0.5);
    expect(normalizeExpression({ Nope: 1 }).Smile).toBe(0);
    expect(Object.keys(normalizeExpression(null))).toHaveLength(18);
  });

  it("collects morph names from a traversable root", () => {
    const root = {
      traverse(callback: (object: { morphTargetDictionary?: Record<string, number> }) => void) {
        callback({ morphTargetDictionary: { Smile: 0, Angry: 1 } });
      },
    };
    expect(collectExpressionNames(root)).toEqual(["Angry", "Smile"]);
  });
});
