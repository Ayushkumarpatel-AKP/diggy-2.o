/**
 * Audio-analyser lip-sync feed — turns a mic/TTS level into smoothed viseme
 * weights (`aa/ih/ou/ee/oh`). Pure maths, so it is fully unit-testable.
 *
 * // INTERFACE FOR INTEGRATION
 * const VISEMES = ["aa", "ih", "ou", "ee", "oh"] as const;
 * type Viseme = (typeof VISEMES)[number];
 * type VisemeWeights = Record<Viseme, number>;
 * interface AudioBands { low; mid; high }        // each 0..1
 * class LipSyncFeed {
 *   constructor(options?: { gain?; attack?; release? });
 *   update(level: number, delta: number): VisemeWeights;             // amplitude only
 *   updateFromBands(bands: AudioBands, delta: number): VisemeWeights; // vowel shaping
 *   readonly weights: VisemeWeights;
 *   readonly openness: number;                                       // 0..1 mouth-open
 *   reset(): void;
 *   toExpression(): AvatarExpression;   // { aa, ih, ou, ee, oh } as morph weights
 * }
 * function attachLipSync(avatar, feed): { push(level, delta): void; pushBands(bands, delta): void; reset(): void };
 * // END INTERFACE FOR INTEGRATION
 *
 * Weights use fast-attack / slow-release damping so speech looks natural (ported
 * from the seed `LipSync`, which damped the VRM `aa` morph the same way).
 */
import type { AvatarAPI, AvatarExpression } from "@diggy/shared";

export const VISEMES = ["aa", "ih", "ou", "ee", "oh"] as const;
export type Viseme = (typeof VISEMES)[number];
export type VisemeWeights = Record<Viseme, number>;

/** Coarse band energies, each normalised 0..1. */
export interface AudioBands {
  low: number;
  mid: number;
  high: number;
}

export interface LipSyncOptions {
  /** Multiplier applied to the raw level before clamping. Defaults to 3. */
  gain?: number;
  /** Attack speed (higher = snappier open). Defaults to 22. */
  attack?: number;
  /** Release speed (higher = faster close). Defaults to 9. */
  release?: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function zeroWeights(): VisemeWeights {
  return { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
}

/** Frame-rate-independent exponential damping. */
function damp(current: number, target: number, lambda: number, delta: number): number {
  if (!Number.isFinite(delta) || delta <= 0) return current;
  const t = 1 - Math.exp(-Math.max(0, lambda) * delta);
  return current + (target - current) * t;
}

/**
 * Maps a loudness (and optional low/mid/high bands) onto the five visemes.
 *
 * With bands available the mix is vowel-shaped (low→ou, mid→oh/aa,
 * high→ee/ih); with only a level, the mouth opens on `aa` with a small blended
 * spread so it never looks like a hard on/off.
 */
export class LipSyncFeed {
  private readonly gain: number;
  private readonly attack: number;
  private readonly release: number;
  private _openness = 0;
  private _weights: VisemeWeights = zeroWeights();

  constructor(options: LipSyncOptions = {}) {
    this.gain = options.gain ?? 3;
    this.attack = options.attack ?? 22;
    this.release = options.release ?? 9;
  }

  get openness(): number {
    return this._openness;
  }

  get weights(): VisemeWeights {
    return { ...this._weights };
  }

  private stepOpenness(target: number, delta: number): void {
    const lambda = target > this._openness ? this.attack : this.release;
    this._openness = clamp01(damp(this._openness, target, lambda, delta));
  }

  /** Amplitude-only update: mostly `aa`, with a touch of the others. */
  update(level: number, delta: number): VisemeWeights {
    this.stepOpenness(clamp01(level * this.gain), delta);
    const open = this._openness;
    const targets: VisemeWeights = {
      aa: open,
      ih: open * 0.12,
      ou: open * 0.08,
      ee: open * 0.1,
      oh: open * 0.15,
    };
    this.dampWeights(targets, delta);
    return this.weights;
  }

  /** Band-aware update: shape the mouth toward the dominant vowel region. */
  updateFromBands(bands: AudioBands, delta: number): VisemeWeights {
    const low = clamp01(bands.low);
    const mid = clamp01(bands.mid);
    const high = clamp01(bands.high);
    const energy = Math.sqrt(low * low + mid * mid + high * high);
    this.stepOpenness(clamp01(energy * this.gain), delta);

    const sum = low + mid + high;
    const open = this._openness;
    let targets: VisemeWeights;
    if (sum <= 0) {
      targets = zeroWeights();
    } else {
      const shares: VisemeWeights = {
        aa: (mid * 0.6 + low * 0.4) / sum,
        ih: (high * 0.7 + mid * 0.3) / sum,
        ou: low / sum,
        ee: high / sum,
        oh: mid / sum,
      };
      targets = {
        aa: open * shares.aa,
        ih: open * shares.ih,
        ou: open * shares.ou,
        ee: open * shares.ee,
        oh: open * shares.oh,
      };
    }
    this.dampWeights(targets, delta);
    return this.weights;
  }

  private dampWeights(targets: VisemeWeights, delta: number): void {
    for (const viseme of VISEMES) {
      const target = targets[viseme];
      const lambda = target > this._weights[viseme] ? this.attack : this.release;
      this._weights[viseme] = clamp01(damp(this._weights[viseme], target, lambda, delta));
    }
  }

  reset(): void {
    this._openness = 0;
    this._weights = zeroWeights();
  }

  /** The weights as an `AvatarExpression` (`aa/ih/ou/ee/oh` morph keys). */
  toExpression(): AvatarExpression {
    return { ...this._weights };
  }
}

/**
 * Drive an avatar's face from a lip-sync feed.
 *
 * The host pushes a level (from the mic during recording, or from TTS playback)
 * and the avatar's expression is updated in place. Weights round to 3 dp to avoid
 * pointless re-renders from float noise.
 */
export function attachLipSync(
  avatar: Pick<AvatarAPI, "setExpression">,
  feed: LipSyncFeed,
): {
  push(level: number, delta: number): void;
  pushBands(bands: AudioBands, delta: number): void;
  reset(): void;
} {
  const apply = (weights: VisemeWeights): void => {
    const expression: AvatarExpression = {};
    for (const viseme of VISEMES) {
      expression[viseme] = Math.round(weights[viseme] * 1000) / 1000;
    }
    avatar.setExpression(expression);
  };
  return {
    push(level, delta) {
      apply(feed.update(level, delta));
    },
    pushBands(bands, delta) {
      apply(feed.updateFromBands(bands, delta));
    },
    reset() {
      feed.reset();
      apply(zeroWeights());
    },
  };
}
