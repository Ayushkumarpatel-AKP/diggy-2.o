/**
 * FBX framing math (pure) — a faithful port of `frameFbx()` from the reference
 * `diggy motion/app.js`.
 *
 * The reference frames a freshly-loaded FBX by measuring its bounding box,
 * scaling it to a target height and dropping it onto the origin. Keeping the
 * arithmetic here (rather than inline in the R3F component) means it is
 * unit-testable and identical between the FBX and any future renderer.
 */

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface Box3Like {
  min: Vec3Like;
  max: Vec3Like;
}

export interface FbxFrame {
  /** Uniform scale to apply to the model root. */
  scale: number;
  /** Position to apply to the model root (feet on the origin, centred in x/z). */
  position: Vec3Like;
  /** The measured height before scaling (metres). */
  height: number;
}

/** Target world height the framed avatar should occupy (metres) — from `app.js`. */
export const FBX_TARGET_HEIGHT = 2.15;

function finite(value: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Compute the scale + position that reproduces `frameFbx()`.
 *
 * `scale = target / max(height, 0.01)`;
 * `position = (-center.x * scale, -box.min.y * scale, -center.z * scale)`.
 *
 * Non-finite bounds degrade to a no-op frame (scale 1, position zero) rather
 * than poisoning the transform with `NaN`.
 */
export function computeFbxFrame(box: Box3Like, targetHeight = FBX_TARGET_HEIGHT): FbxFrame {
  const minX = finite(box?.min?.x, 0);
  const minY = finite(box?.min?.y, 0);
  const minZ = finite(box?.min?.z, 0);
  const maxX = finite(box?.max?.x, 0);
  const maxY = finite(box?.max?.y, 0);
  const maxZ = finite(box?.max?.z, 0);

  const rawHeight = maxY - minY;
  if (!Number.isFinite(rawHeight) || rawHeight <= 0) {
    return { scale: 1, position: { x: 0, y: 0, z: 0 }, height: 0 };
  }

  const height = Math.max(rawHeight, 0.01);
  const scale = targetHeight / height;
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;

  return {
    scale,
    position: {
      x: -centerX * scale,
      y: -minY * scale,
      z: -centerZ * scale,
    },
    height,
  };
}
