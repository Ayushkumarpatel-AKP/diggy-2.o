import { describe, expect, it } from "vitest";

import { FBX_TARGET_HEIGHT, computeFbxFrame } from "../src/framing.js";

describe("computeFbxFrame (port of app.js frameFbx)", () => {
  it("scales to the target height and drops the feet onto the origin", () => {
    const frame = computeFbxFrame({ min: { x: -1, y: 0, z: -0.5 }, max: { x: 1, y: 2, z: 0.5 } });
    expect(frame.scale).toBeCloseTo(FBX_TARGET_HEIGHT / 2);
    expect(frame.position.y).toBeCloseTo(0);
    expect(frame.position.x).toBeCloseTo(0);
    expect(frame.position.z).toBeCloseTo(0);
    expect(frame.height).toBeCloseTo(2);
  });

  it("centres a non-symmetric box", () => {
    const frame = computeFbxFrame({ min: { x: 0, y: -1, z: 0 }, max: { x: 2, y: 1, z: 4 } }, 2);
    expect(frame.scale).toBeCloseTo(1);
    expect(frame.position.x).toBeCloseTo(-1);
    expect(frame.position.y).toBeCloseTo(1);
    expect(frame.position.z).toBeCloseTo(-2);
  });

  it("degenerates safely on a zero-height box", () => {
    const frame = computeFbxFrame({ min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } });
    expect(frame.scale).toBe(1);
    expect(frame.position).toEqual({ x: 0, y: 0, z: 0 });
  });
});
