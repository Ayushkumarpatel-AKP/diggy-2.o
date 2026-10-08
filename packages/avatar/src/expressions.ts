/**
 * FBX morph-target expressions — ported verbatim from the reference
 * `diggy motion/app.js` (`expressionNames`, `expressionPresets`,
 * `motionExpressionProfiles`). Values are 0..1 influences keyed by the morph
 * target name baked into `Chiori.fbx`.
 *
 * Everything here is pure so it can be tested without three.js; the mesh-facing
 * helper accepts a *structural* interface (`morphTargetDictionary` /
 * `morphTargetInfluences`) and skips any morph a rig does not have instead of
 * throwing.
 */
import type { AvatarExpression, AvatarState } from "@diggy/shared";

/** Every morph-target name the Chiori face is authored with. */
export const EXPRESSION_NAMES = [
  "Smile",
  "Smile2",
  "Smile3",
  "Blink",
  "Wink",
  "Up",
  "Down",
  "Left",
  "Right",
  "Sad",
  "Sad2",
  "Sad3",
  "Kiss",
  "Nose",
  "Confused",
  "Angry",
  "Surprised",
  "Smug",
] as const;

export type ExpressionName = (typeof EXPRESSION_NAMES)[number];

/** Named expression presets (the semantic faces a host can ask for). */
export type ExpressionPresetName =
  | "happy"
  | "surprised"
  | "angry"
  | "wink"
  | "sad"
  | "kiss"
  | "confused"
  | "smug"
  | "sleepy"
  | "excited";

/** Preset influences — ported 1:1 from `app.js` `expressionPresets`. */
export const EXPRESSION_PRESETS: Record<ExpressionPresetName, AvatarExpression> = {
  happy: { Smile: 0.85, Smile2: 0.45, Smile3: 0.25 },
  surprised: { Surprised: 0.9, Up: 0.35, Blink: 0 },
  angry: { Angry: 0.9, Sad: 0.15 },
  wink: { Smile: 0.35, Wink: 1 },
  sad: { Sad: 0.85, Sad2: 0.45, Sad3: 0.25, Down: 0.25 },
  kiss: { Kiss: 0.95, Smile: 0.2 },
  confused: { Confused: 0.9, Up: 0.2, Left: 0.3 },
  smug: { Smug: 0.9, Smile: 0.3 },
  sleepy: { Sad: 0.35, Sad2: 0.2, Blink: 0.75, Down: 0.25 },
  excited: { Smile: 0.95, Smile2: 0.7, Surprised: 0.35, Up: 0.25 },
};

/** Every preset name, in a stable order. */
export const EXPRESSION_PRESET_NAMES: readonly ExpressionPresetName[] = [
  "happy",
  "surprised",
  "angry",
  "wink",
  "sad",
  "kiss",
  "confused",
  "smug",
  "sleepy",
  "excited",
];

/**
 * Which preset each FBX clip leans on — ported from `app.js`
 * `motionExpressionProfiles`, re-keyed to this package's clip ids.
 */
export const MOTION_EXPRESSION_PROFILES: Record<string, ExpressionPresetName> = {
  "standing-idle": "smug",
  walking: "happy",
  "angry-point": "angry",
  "arm-stretching": "surprised",
  "happy-walk": "excited",
  clapping: "happy",
  looking: "confused",
  "standing-greeting": "happy",
};

/** Which preset each avatar state leans on (drives the face during the state). */
export const EXPRESSION_FOR_STATE: Record<AvatarState, ExpressionPresetName | null> = {
  idle: "smug",
  blink: null,
  breathing: null,
  listening: "happy",
  thinking: "confused",
  speaking: "happy",
  walk: "happy",
  happy: "excited",
  success: "happy",
  warning: "angry",
  sleep: "sleepy",
  celebration: "excited",
};

/** A face with every morph at 0. */
export function emptyExpression(): AvatarExpression {
  const out: AvatarExpression = {};
  for (const name of EXPRESSION_NAMES) out[name] = 0;
  return out;
}

/** Zero-fill every known morph name, ignoring unknown keys and `null`/`undefined`. */
export function normalizeExpression(values: AvatarExpression | null | undefined): AvatarExpression {
  const out: AvatarExpression = {};
  for (const name of EXPRESSION_NAMES) out[name] = values?.[name] ?? 0;
  return out;
}

/** The preset influences for a clip id, or `null` when the clip has none. */
export function presetForClip(clipId: string): AvatarExpression | null {
  const name = MOTION_EXPRESSION_PROFILES[clipId];
  if (!name) return null;
  return EXPRESSION_PRESETS[name];
}

/** The preset influences for an avatar state, or `null` when the face is blank. */
export function presetForState(state: AvatarState): AvatarExpression | null {
  const name = EXPRESSION_FOR_STATE[state];
  if (!name) return null;
  return EXPRESSION_PRESETS[name];
}

/** Ease a 0..1 value (smoothstep) — the reference's `easeExpression`. */
export function easeExpression(value: number): number {
  const v = value < 0 ? 0 : value > 1 ? 1 : value;
  return v * v * (3 - 2 * v);
}

/** Exponential-lerp one expression map toward another (default smoothing 0.12). */
export function blendExpression(
  current: AvatarExpression,
  target: AvatarExpression,
  smoothing = 0.12,
): AvatarExpression {
  const s = smoothing < 0 ? 0 : smoothing > 1 ? 1 : smoothing;
  const out: AvatarExpression = {};
  for (const name of EXPRESSION_NAMES) {
    const from = current[name] ?? 0;
    const to = target[name] ?? 0;
    out[name] = from + (to - from) * s;
  }
  return out;
}

/** A three.js morph-capable mesh, described structurally so it can be faked in tests. */
export interface MorphMeshLike {
  morphTargetDictionary?: Record<string, number> | null;
  morphTargetInfluences?: number[] | null;
}

/**
 * Write expression influences onto one mesh. Returns how many morphs were
 * applied. Missing dictionaries, unknown morph names and out-of-range indices
 * are all skipped — this is the "missing bone/morph degrades" path.
 */
export function applyExpressionToMesh(mesh: MorphMeshLike, weights: AvatarExpression): number {
  const dictionary = mesh.morphTargetDictionary;
  const influences = mesh.morphTargetInfluences;
  if (!dictionary || !influences) return 0;

  let applied = 0;
  for (const [name, value] of Object.entries(weights)) {
    const index = dictionary[name];
    if (typeof index !== "number" || !Number.isFinite(index) || index < 0 || index >= influences.length) {
      continue;
    }
    const numeric = typeof value === "number" && Number.isFinite(value) ? value : 0;
    influences[index] = Math.max(0, numeric);
    applied += 1;
  }
  return applied;
}

/** Apply one expression map across every morph mesh (returns total applied). */
export function applyExpressionToMeshes(
  meshes: readonly MorphMeshLike[],
  weights: AvatarExpression,
): number {
  let applied = 0;
  for (const mesh of meshes) applied += applyExpressionToMesh(mesh, weights);
  return applied;
}

/** A traversable root (a three.js `Object3D` satisfies this). */
export interface MorphTraversable {
  traverse(callback: (object: MorphMeshLike) => void): void;
}

/** Every morph-target name present on a model, sorted (never throws). */
export function collectExpressionNames(root: MorphTraversable): string[] {
  const names = new Set<string>();
  root.traverse((object) => {
    const dictionary = object.morphTargetDictionary;
    if (!dictionary) return;
    for (const key of Object.keys(dictionary)) names.add(key);
  });
  return [...names].sort();
}

/** Every morph mesh on a model (structural, for runtime use). */
export function collectMorphMeshes<T extends MorphMeshLike>(root: {
  traverse(callback: (object: T) => void): void;
}): T[] {
  const meshes: T[] = [];
  root.traverse((object) => {
    if (object.morphTargetDictionary && object.morphTargetInfluences) meshes.push(object);
  });
  return meshes;
}
