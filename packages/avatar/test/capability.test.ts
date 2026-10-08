import { describe, expect, it } from "vitest";

import {
  CANONICAL_BONES,
  countTriangles,
  buildCapabilityReport,
  detectBones,
  findBoneName,
  matchesBone,
  MAX_TRIANGLES,
  meshTriangleCount,
  normalizeBoneName,
} from "../src/capability.js";

describe("capability report", () => {
  it("reports detected bones/expressions/clips and warns on gaps", () => {
    const report = buildCapabilityReport(
      {
        source: "fbx",
        bones: ["mixamorig:Hips", "Armature|Head", "mixamorig:Spine"],
        expressions: ["Smile", "Blink"],
        clips: ["standing-idle"],
        triangles: 12_345,
      },
      { requiredClips: ["standing-idle", "walking"] },
    );

    expect(report.source).toBe("fbx");
    expect(report.bones).toContain("hips");
    expect(report.bones).toContain("head");
    expect(report.bones).toContain("spine");
    expect(report.triangles).toBe(12_345);
    expect(report.warnings.some((w) => w.includes("Missing bones"))).toBe(true);
    expect(report.warnings.some((w) => w.includes("Missing clips: walking"))).toBe(true);
  });

  it("never throws on a completely empty inventory", () => {
    const report = buildCapabilityReport({ source: "vrm" });
    expect(report.source).toBe("vrm");
    expect(report.bones).toEqual([]);
    expect(report.expressions).toEqual([]);
    expect(report.clips).toEqual([]);
    expect(report.triangles).toBe(0);
    expect(report.warnings.length).toBeGreaterThan(0);
    expect(report.warnings.some((w) => w.includes("No bones"))).toBe(true);
    expect(report.warnings.some((w) => w.includes("No animation clips"))).toBe(true);
    expect(report.warnings.some((w) => w.includes("No morph-target"))).toBe(true);
  });

  it("warns when the triangle budget is exceeded", () => {
    const report = buildCapabilityReport({ source: "fbx", triangles: MAX_TRIANGLES + 1 });
    expect(report.warnings.some((w) => w.includes("Triangle budget exceeded"))).toBe(true);
  });

  it("coerces a bogus triangle count to 0", () => {
    expect(buildCapabilityReport({ source: "fbx", triangles: Number.NaN }).triangles).toBe(0);
    expect(buildCapabilityReport({ source: "fbx", triangles: -5 }).triangles).toBe(0);
  });
});

describe("bone normalisation (missing bones degrade)", () => {
  it("normalises raw FBX bone names", () => {
    expect(normalizeBoneName("mixamorig:LeftUpperArm")).toBe("mixamorigleftupperarm");
    expect(matchesBone("leftUpperArm", normalizeBoneName("mixamorig:LeftArm"))).toBe(true);
    expect(matchesBone("head", normalizeBoneName("Armature|Head"))).toBe(true);
    expect(matchesBone("leftHand", normalizeBoneName("mixamorig:LeftArm"))).toBe(false);
  });

  it("splits detected vs missing bones and finds raw names", () => {
    const { detected, missing } = detectBones(["mixamorig:Hips", "Armature|Head"]);
    expect(detected).toContain("hips");
    expect(detected).toContain("head");
    expect(missing).toContain("leftFoot");
    expect(findBoneName(["Armature|Head"], "head")).toBe("Armature|Head");
    expect(findBoneName(["Armature|Hips"], "head")).toBeUndefined();
  });

  it("detects the Chiori ValveBiped rig with no missing bones", () => {
    // Real bone names from Chiori.fbx (parsed during development).
    const raw = [
      "ValveBipedBip01_Pelvis",
      "ValveBipedBip01_Spine",
      "ValveBipedBip01_Spine1",
      "ValveBipedBip01_Neck1",
      "ValveBipedBip01_Head1",
      "ValveBipedBip01_L_UpperArm",
      "ValveBipedBip01_L_Forearm",
      "ValveBipedBip01_L_Hand",
      "ValveBipedBip01_R_UpperArm",
      "ValveBipedBip01_R_Forearm",
      "ValveBipedBip01_R_Hand",
      "ValveBipedBip01_L_Thigh",
      "ValveBipedBip01_L_Calf",
      "ValveBipedBip01_L_Foot",
      "ValveBipedBip01_R_Thigh",
      "ValveBipedBip01_R_Calf",
      "ValveBipedBip01_R_Foot",
    ];
    const { detected, missing } = detectBones(raw);
    expect(missing).toEqual([]);
    expect(detected).toEqual(expect.arrayContaining([...CANONICAL_BONES]));
  });
});

describe("triangle counting", () => {
  it("counts indexed, non-indexed and empty geometry", () => {
    expect(meshTriangleCount({ geometry: { index: { count: 300 } } })).toBe(100);
    expect(meshTriangleCount({ geometry: { getAttribute: () => ({ count: 9 }) } })).toBe(3);
    expect(meshTriangleCount({ geometry: null })).toBe(0);
    expect(meshTriangleCount({})).toBe(0);
  });

  it("sums across meshes", () => {
    const total = countTriangles([
      { geometry: { index: { count: 30 } } },
      { geometry: { index: { count: 60 } } },
      { geometry: null },
    ]);
    expect(total).toBe(30);
  });
});
