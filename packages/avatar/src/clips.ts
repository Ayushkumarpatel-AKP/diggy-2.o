/**
 * FBX clip catalogue for `@diggy/avatar`.
 *
 * Single source of truth for the animation clips shipped under `assets/avatar`.
 * The `file` names are copied verbatim from `diggy motion/` (the brief forbids
 * renaming), so a host can resolve them against any asset base path.
 *
 * NOTE: the brief refers to "9 clips"; the asset lab on disk ships **8** clip
 * FBX files plus `Chiori.fbx`. This table is the authoritative list of what
 * actually exists — a host iterating it never asks for a file that is missing.
 */
import type { AvatarState } from "@diggy/shared";

/** One FBX animation clip that can be played on the Chiori rig. */
export interface AvatarClip {
  /** Stable, human-readable id used by the state machine (e.g. `"standing-idle"`). */
  readonly id: string;
  /** Exact file name on disk (never renamed). */
  readonly file: string;
  /** Human-facing label. */
  readonly label: string;
  /** Whether the clip is authored to loop seamlessly. */
  readonly loop: boolean;
  /** Rough energy (0..100) — mirrors the reference motion list. */
  readonly energy: number;
}

/** Every clip shipped in `assets/avatar` (excluding the base `Chiori.fbx`). */
export const AVATAR_CLIPS: readonly AvatarClip[] = [
  { id: "standing-idle", file: "Standing Idle.fbx", label: "Standing Idle", loop: true, energy: 70 },
  { id: "walking", file: "Walking.fbx", label: "Walking", loop: true, energy: 100 },
  { id: "happy-walk", file: "Happy Walk.fbx", label: "Happy Walk", loop: true, energy: 100 },
  { id: "clapping", file: "Clapping.fbx", label: "Clapping", loop: true, energy: 100 },
  { id: "angry-point", file: "Angry Point.fbx", label: "Angry Point", loop: false, energy: 100 },
  { id: "arm-stretching", file: "Arm Stretching.fbx", label: "Arm Stretching", loop: false, energy: 100 },
  { id: "looking", file: "Looking.fbx", label: "Looking", loop: true, energy: 100 },
  { id: "standing-greeting", file: "Standing Greeting.fbx", label: "Standing Greeting", loop: false, energy: 100 },
];

/** Name of the base model file that every clip animates. */
export const BASE_MODEL_FILE = "Chiori.fbx";

/**
 * Graceful-degradation order. If a state's preferred clip is missing we fall
 * back through these before giving up (`resolveClip` then returns `null`, which
 * callers treat as "procedural idle only" — never an error).
 */
export const CLIP_FALLBACKS: readonly string[] = ["standing-idle"];

/** All clip ids, in catalogue order. */
export function clipIds(): string[] {
  return AVATAR_CLIPS.map((clip) => clip.id);
}

/** Look up a clip by id (never throws). */
export function clipById(id: string): AvatarClip | undefined {
  return AVATAR_CLIPS.find((clip) => clip.id === id);
}

/** Look up a clip's file name by id (never throws). */
export function clipFile(id: string): string | undefined {
  return clipById(id)?.file;
}

/** The file name of the clip a state prefers, if the catalogue knows it. */
export function clipFileForState(state: AvatarState, resolvedClipId: string | null): string | undefined {
  const resolved = resolvedClipId ?? state;
  return clipFile(resolved);
}
