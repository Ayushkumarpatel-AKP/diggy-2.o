/**
 * Capability reporting + rig introspection (pure, three.js-free).
 *
 * `buildCapabilityReport` turns a raw inventory (bone names, expression names,
 * loaded clip ids, triangle count) into the shared {@link AvatarCapabilityReport},
 * adding human-readable warnings for anything missing. It is the single place
 * that decides "what can this avatar actually do?" and it never throws — a
 * partial or empty inventory degrades to warnings.
 */
import type { AvatarCapabilityReport } from "@diggy/shared";

/** Triangle budget for the corner avatar (brief target: ≤30k tris). */
export const MAX_TRIANGLES = 30_000;

/**
 * Canonical bone ids (from `app.js` `boneNames`). Reported as `bones` when
 * detected, and used as the default required-bone set for warnings.
 */
export const CANONICAL_BONES: readonly string[] = [
  "hips",
  "spine",
  "chest",
  "neck",
  "head",
  "leftUpperArm",
  "leftLowerArm",
  "leftHand",
  "rightUpperArm",
  "rightLowerArm",
  "rightHand",
  "leftUpperLeg",
  "leftLowerLeg",
  "leftFoot",
  "rightUpperLeg",
  "rightLowerLeg",
  "rightFoot",
];

/**
 * Fuzzy aliases per canonical bone. FBX exports vary wildly (`mixamorig:Hips`,
 * `Armature|LeftArm`, …), so a canonical id is "present" when any alias appears
 * as a substring of a normalised (lowercased, alphanumeric-only) raw name.
 *
 * The `bip01*l*` / `bip01*r*` forms cover the **ValveBiped** naming actually used
 * by `Chiori.fbx` (e.g. `ValveBipedBip01_L_UpperArm`, `ValveBipedBip01_R_Calf`).
 */
export const BONE_ALIASES: Record<string, readonly string[]> = {
  hips: ["hips", "pelvis"],
  spine: ["spine"],
  // Chiori has Spine/Spine1/Spine2/Spine4 but no literal "Chest".
  chest: ["chest", "spine1", "spine2", "upperchest"],
  neck: ["neck"],
  head: ["head"],
  leftUpperArm: ["leftupperarm", "leftarm", "lupperarm"],
  leftLowerArm: ["leftlowerarm", "leftforearm", "leftelbow", "lforearm"],
  leftHand: ["lefthand", "lhand"],
  rightUpperArm: ["rightupperarm", "rightarm", "rupperarm"],
  rightLowerArm: ["rightlowerarm", "rightforearm", "rightelbow", "rforearm"],
  rightHand: ["righthand", "rhand"],
  leftUpperLeg: ["leftupperleg", "leftupleg", "leftthigh", "lthigh"],
  leftLowerLeg: ["leftlowerleg", "leftleg", "leftshin", "lcalf"],
  leftFoot: ["leftfoot", "lfoot"],
  rightUpperLeg: ["rightupperleg", "rightupleg", "rightthigh", "rthigh"],
  rightLowerLeg: ["rightlowerleg", "rightleg", "rightshin", "rcalf"],
  rightFoot: ["rightfoot", "rfoot"],
};

/** Raw inventory gathered from a loaded model. */
export interface AvatarCapabilityInventory {
  source: "fbx" | "vrm";
  bones?: readonly string[] | null;
  expressions?: readonly string[] | null;
  clips?: readonly string[] | null;
  triangles?: number | null;
}

/** Optional expectations that turn "missing" into an explicit warning. */
export interface CapabilityExpectations {
  requiredBones?: readonly string[];
  requiredClips?: readonly string[];
  maxTriangles?: number;
}

/** Normalise a raw bone name: lowercase, strip everything but `a-z0-9`. */
export function normalizeBoneName(name: string): string {
  return String(name).toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** True when a normalised raw name satisfies a canonical bone id. */
export function matchesBone(canonical: string, rawNormalized: string): boolean {
  const aliases = BONE_ALIASES[canonical] ?? [normalizeBoneName(canonical)];
  return aliases.some((alias) => rawNormalized.includes(alias));
}

/** The first raw bone name that satisfies `canonical` (for runtime look-ups). */
export function findBoneName(
  rawBones: readonly string[],
  canonical: string,
): string | undefined {
  return rawBones.find((raw) => matchesBone(canonical, normalizeBoneName(raw)));
}

/** Split raw bone names into detected / missing canonical ids. */
export function detectBones(rawBones: readonly string[]): { detected: string[]; missing: string[] } {
  const normalized = rawBones.map(normalizeBoneName);
  const detected: string[] = [];
  const missing: string[] = [];
  for (const canonical of CANONICAL_BONES) {
    if (normalized.some((raw) => matchesBone(canonical, raw))) detected.push(canonical);
    else missing.push(canonical);
  }
  return { detected, missing };
}

/** A three.js mesh, described structurally so it can be faked in tests. */
export interface MeshLike {
  isMesh?: boolean;
  geometry?: {
    index?: { count?: number } | null;
    getAttribute?: (name: string) => { count?: number } | undefined;
  } | null;
}

/** Triangle count for one mesh (0 when it has no usable geometry). */
export function meshTriangleCount(mesh: MeshLike): number {
  const geometry = mesh?.geometry;
  if (!geometry) return 0;
  const indexCount = geometry.index?.count;
  if (typeof indexCount === "number" && Number.isFinite(indexCount)) {
    return Math.max(0, Math.floor(indexCount / 3));
  }
  const positionCount = geometry.getAttribute?.("position")?.count;
  if (typeof positionCount === "number" && Number.isFinite(positionCount)) {
    return Math.max(0, Math.floor(positionCount / 3));
  }
  return 0;
}

/** Total triangle count across a set of meshes. */
export function countTriangles(meshes: Iterable<MeshLike>): number {
  let total = 0;
  for (const mesh of meshes) total += meshTriangleCount(mesh);
  return total;
}

function toNames(values: readonly string[] | null | undefined): string[] {
  if (!values) return [];
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) seen.add(trimmed);
  }
  return [...seen];
}

/**
 * Build the shared capability report from a raw inventory.
 *
 * Never throws. Missing arrays are treated as empty; a non-finite or negative
 * triangle count is reported as 0. Warnings explain every degradation.
 */
export function buildCapabilityReport(
  inventory: AvatarCapabilityInventory,
  expectations: CapabilityExpectations = {},
): AvatarCapabilityReport {
  const source: "fbx" | "vrm" = inventory?.source === "vrm" ? "vrm" : "fbx";
  const rawBones = toNames(inventory?.bones);
  const expressions = toNames(inventory?.expressions);
  const clips = toNames(inventory?.clips);

  const { detected, missing } = detectBones(rawBones);

  const rawTriangles = inventory?.triangles;
  const triangles =
    typeof rawTriangles === "number" && Number.isFinite(rawTriangles) && rawTriangles > 0
      ? Math.floor(rawTriangles)
      : 0;

  const warnings: string[] = [];

  const requiredBones = expectations.requiredBones ?? CANONICAL_BONES;
  const missingRequired = requiredBones.filter((bone) => !detected.includes(bone));
  if (rawBones.length === 0) {
    warnings.push("No bones detected; procedural layers will be skipped.");
  } else if (missingRequired.length > 0) {
    warnings.push(`Missing bones (layers degrade gracefully): ${missingRequired.join(", ")}.`);
  }

  if (clips.length === 0) {
    warnings.push("No animation clips loaded; falling back to procedural idle.");
  }
  const requiredClips = expectations.requiredClips;
  if (requiredClips && requiredClips.length > 0) {
    const missingClips = requiredClips.filter((clip) => !clips.includes(clip));
    if (missingClips.length > 0) warnings.push(`Missing clips: ${missingClips.join(", ")}.`);
  }

  if (expressions.length === 0) {
    warnings.push("No morph-target expressions found; facial presets are unavailable.");
  }

  const maxTriangles = expectations.maxTriangles ?? MAX_TRIANGLES;
  if (triangles > maxTriangles) {
    warnings.push(`Triangle budget exceeded: ${triangles} > ${maxTriangles}.`);
  }

  // `missing` is exposed to callers that want the full undetected list.
  void missing;

  return { source, bones: detected, expressions, clips, triangles, warnings };
}
