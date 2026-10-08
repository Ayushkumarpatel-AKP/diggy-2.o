import { describe, expect, it } from "vitest";

import {
  addBoneOffset,
  blinkWeight,
  breathOffsets,
  filterAvailableBones,
  frameIntervalSeconds,
  mergeBoneOffsets,
} from "../src/procedural.js";

describe("missing bones degrade without throwing", () => {
  it("keeps only offsets for bones the rig actually has", () => {
    const offsets = new Map([
      ["head", { x: 0.1 }],
      ["tail", { z: 1 }],
    ]);
    const kept = filterAvailableBones(offsets, (name) => name === "head");
    expect(kept.has("head")).toBe(true);
    expect(kept.has("tail")).toBe(false);
    expect(() => filterAvailableBones(offsets, () => false)).not.toThrow();
    expect(filterAvailableBones(offsets, () => false).size).toBe(0);
  });

  it("merges additive offsets, summing each axis", () => {
    const a = new Map<string, { x?: number }>();
    addBoneOffset(a, "chest", { x: 0.01 });
    const b = new Map<string, { x?: number }>();
    addBoneOffset(b, "chest", { x: 0.02 });
    addBoneOffset(b, "spine", { y: 0.05 });
    const merged = mergeBoneOffsets(a, b, undefined);
    expect(merged.get("chest")?.x).toBeCloseTo(0.03);
    expect(merged.get("spine")?.y).toBeCloseTo(0.05);
  });
});

describe("procedural layers", () => {
  it("keeps the blink weight inside 0..1", () => {
    for (let t = 0; t < 10; t += 0.01) {
      const weight = blinkWeight(t);
      expect(weight).toBeGreaterThanOrEqual(0);
      expect(weight).toBeLessThanOrEqual(1);
    }
  });

  it("produces finite breath offsets", () => {
    const offsets = breathOffsets(1.2, 1);
    expect(offsets.size).toBeGreaterThan(0);
    for (const offset of offsets.values()) {
      expect(Number.isFinite(offset.x ?? 0)).toBe(true);
    }
    expect(breathOffsets(0, 0).size).toBeGreaterThan(0);
  });

  it("derives a safe frame interval", () => {
    expect(frameIntervalSeconds(30)).toBeCloseTo(1 / 30);
    expect(frameIntervalSeconds(0)).toBeCloseTo(1 / 30);
    expect(frameIntervalSeconds(Number.NaN)).toBeCloseTo(1 / 30);
  });
});
