/**
 * Procedural animation layers + bone-offset plumbing (pure, three.js-free).
 *
 * These are the layers that ride *on top of* an FBX clip so the avatar stays
 * alive between clips: an always-on auto-blink and a breathing cycle. They are
 * expressed as additive Euler offsets keyed by canonical bone id, and merged by
 * {@link filterAvailableBones} against whatever bones the rig actually has — a
 * missing bone is dropped, never an error.
 */

/** An additive Euler offset in radians, applied on top of a bone's rest pose. */
export interface BoneOffset {
  x?: number;
  y?: number;
  z?: number;
}

/** Merge `offset` into `map[name]`, summing each axis. */
export function addBoneOffset(
  map: Map<string, BoneOffset>,
  name: string,
  offset: BoneOffset,
): void {
  const current = map.get(name);
  if (!current) {
    map.set(name, { x: offset.x, y: offset.y, z: offset.z });
    return;
  }
  map.set(name, {
    x: (current.x ?? 0) + (offset.x ?? 0),
    y: (current.y ?? 0) + (offset.y ?? 0),
    z: (current.z ?? 0) + (offset.z ?? 0),
  });
}

/** Merge any number of offset maps into a new one. */
export function mergeBoneOffsets(
  ...maps: ReadonlyArray<ReadonlyMap<string, BoneOffset> | undefined>
): Map<string, BoneOffset> {
  const out = new Map<string, BoneOffset>();
  for (const map of maps) {
    if (!map) continue;
    for (const [name, offset] of map) addBoneOffset(out, name, offset);
  }
  return out;
}

/**
 * Drop offsets for bones the rig does not have.
 *
 * This is the graceful-degradation seam: the rig can be missing a bone (a
 * different skeleton, a partial export) and the caller simply animates the bones
 * that exist.
 */
export function filterAvailableBones(
  offsets: ReadonlyMap<string, BoneOffset>,
  hasBone: (name: string) => boolean,
): Map<string, BoneOffset> {
  const out = new Map<string, BoneOffset>();
  for (const [name, offset] of offsets) {
    if (hasBone(name)) out.set(name, offset);
  }
  return out;
}

/** Smoothstep easing over 0..1. */
export function smoothstep(value: number): number {
  const v = value < 0 ? 0 : value > 1 ? 1 : value;
  return v * v * (3 - 2 * v);
}

/**
 * Auto-blink weight (0..1) at `elapsed` seconds.
 *
 * Ported from the reference `app.js` blink cycle so the timing matches the
 * motion lab: a `sin` clock shaped into a short 0..1 pulse.
 */
export function blinkWeight(elapsed: number): number {
  const cycle = (Math.sin(elapsed * 1.45 - 1.1) + 1) / 2;
  return smoothstep(Math.min(Math.max((cycle - 0.91) / 0.09, 0), 1));
}

/**
 * Breathing offsets at `elapsed` seconds. `intensity` (0..N) scales the motion —
 * `sleep` uses a smaller value for a slow, shallow breath.
 */
export function breathOffsets(elapsed: number, intensity = 1): Map<string, BoneOffset> {
  const amount = Number.isFinite(intensity) ? Math.max(0, intensity) : 0;
  const primary = Math.sin(elapsed * Math.PI * 2 * 0.22);
  const secondary = Math.sin(elapsed * Math.PI * 2 * 0.22 + 0.7);
  const offsets = new Map<string, BoneOffset>();
  addBoneOffset(offsets, "chest", { x: 0.02 * primary * amount });
  addBoneOffset(offsets, "upperChest", { x: 0.012 * secondary * amount });
  addBoneOffset(offsets, "spine", { x: 0.01 * primary * amount });
  addBoneOffset(offsets, "neck", { x: -0.015 * primary * amount });
  addBoneOffset(offsets, "head", { x: 0.012 * primary * amount });
  return offsets;
}

/** Seconds between frame updates for a target frame rate (clamped to ≥1). */
export function frameIntervalSeconds(fps: number): number {
  const safe = Number.isFinite(fps) && fps > 0 ? fps : 30;
  return 1 / Math.max(1, safe);
}
