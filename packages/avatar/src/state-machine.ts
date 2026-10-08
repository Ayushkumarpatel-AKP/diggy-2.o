/**
 * The 12-state avatar machine (pure — no three.js, no DOM).
 *
 * Every `AvatarState` from the shared contract is mapped here to:
 *   - a preferred FBX clip id (with a graceful fallback chain),
 *   - a numeric priority (a lower priority never interrupts a higher one),
 *   - a cross-fade duration in seconds (always within 0.2–0.35s),
 *   - an optional facial expression preset,
 *   - optional procedural layers (blink / breath) applied on top of the clip.
 *
 * The machine is intentionally dependency-free so the "all 12 states" and
 * "missing clip degrades" behaviour can be unit-tested without a browser.
 */
import type { AvatarState } from "@diggy/shared";

import { CLIP_FALLBACKS } from "./clips.js";
import type { ExpressionPresetName } from "./expressions.js";

/** Cross-fade clamp (seconds) — matches the brief's 0.2–0.35s window. */
export const MIN_CROSSFADE_SECONDS = 0.2;
export const MAX_CROSSFADE_SECONDS = 0.35;

/** Procedural layers that can ride on top of any clip. */
export type ProceduralLayer = "blink" | "breath";

/** How one avatar state is realised on the rig. */
export interface AvatarStateProfile {
  /** Preferred clip id from `AVATAR_CLIPS`. */
  readonly clip: string;
  /** Higher wins: a lower priority never interrupts a higher one. */
  readonly priority: number;
  /** Cross-fade into this state, in seconds (0.2–0.35). */
  readonly crossFade: number;
  /** Facial expression preset, or `null` for a neutral/blank face. */
  readonly expression: ExpressionPresetName | null;
  /** Procedural layers layered on top of the clip. */
  readonly procedural: readonly ProceduralLayer[];
  /** When true, the machine auto-returns to `idle` after `autoReturnMs`. */
  readonly autoReturn: boolean;
  /** Human-facing label (used for status lines / debug overlays). */
  readonly label: string;
}

/**
 * The canonical 12 states. Mirrors `AvatarState` from `@diggy/shared` and is the
 * order a host should iterate when validating coverage.
 */
export const AVATAR_STATES: readonly AvatarState[] = [
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

/**
 * Priority ladder. Ambient states sit at the bottom, transient "loud" states at
 * the top, so a `play("warning")` is never swallowed by a running `play("walk")`
 * while a stray `play("blink")` can never cut off a `play("celebration")`.
 */
export const STATE_PRIORITY: Record<AvatarState, number> = {
  idle: 0,
  blink: 1,
  breathing: 1,
  sleep: 1,
  walk: 2,
  listening: 2,
  thinking: 2,
  speaking: 2,
  happy: 3,
  success: 4,
  warning: 4,
  celebration: 5,
};

/**
 * Per-state profiles. The clip choices follow the brief:
 * idle→Standing Idle · walk→Walking · happy→Happy Walk · celebration/success→Clapping ·
 * warning→Angry Point · listening→Standing Greeting · thinking/speaking→Looking,
 * with `blink`/`breathing` expressed procedurally over Standing Idle.
 */
export const STATE_PROFILES: Record<AvatarState, AvatarStateProfile> = {
  idle: {
    clip: "standing-idle",
    priority: STATE_PRIORITY.idle,
    crossFade: 0.35,
    expression: "smug",
    procedural: ["breath", "blink"],
    autoReturn: false,
    label: "Idle",
  },
  blink: {
    clip: "standing-idle",
    priority: STATE_PRIORITY.blink,
    crossFade: 0.2,
    expression: null,
    procedural: ["blink"],
    autoReturn: false,
    label: "Blink",
  },
  breathing: {
    clip: "standing-idle",
    priority: STATE_PRIORITY.breathing,
    crossFade: 0.35,
    expression: null,
    procedural: ["breath"],
    autoReturn: false,
    label: "Breathing",
  },
  listening: {
    clip: "standing-greeting",
    priority: STATE_PRIORITY.listening,
    crossFade: 0.3,
    expression: "happy",
    procedural: ["blink"],
    autoReturn: true,
    label: "Listening",
  },
  thinking: {
    clip: "looking",
    priority: STATE_PRIORITY.thinking,
    crossFade: 0.3,
    expression: "confused",
    procedural: ["blink"],
    autoReturn: true,
    label: "Thinking",
  },
  speaking: {
    clip: "looking",
    priority: STATE_PRIORITY.speaking,
    crossFade: 0.25,
    expression: "happy",
    procedural: ["blink"],
    autoReturn: true,
    label: "Speaking",
  },
  walk: {
    clip: "walking",
    priority: STATE_PRIORITY.walk,
    crossFade: 0.28,
    expression: "happy",
    procedural: ["breath"],
    autoReturn: false,
    label: "Walking",
  },
  happy: {
    clip: "happy-walk",
    priority: STATE_PRIORITY.happy,
    crossFade: 0.25,
    expression: "excited",
    procedural: ["blink"],
    autoReturn: true,
    label: "Happy",
  },
  success: {
    clip: "clapping",
    priority: STATE_PRIORITY.success,
    crossFade: 0.22,
    expression: "happy",
    procedural: ["blink"],
    autoReturn: true,
    label: "Success",
  },
  warning: {
    clip: "angry-point",
    priority: STATE_PRIORITY.warning,
    crossFade: 0.22,
    expression: "angry",
    procedural: [],
    autoReturn: true,
    label: "Warning",
  },
  sleep: {
    clip: "standing-idle",
    priority: STATE_PRIORITY.sleep,
    crossFade: 0.35,
    expression: "sleepy",
    procedural: ["breath"],
    autoReturn: false,
    label: "Sleep",
  },
  celebration: {
    clip: "clapping",
    priority: STATE_PRIORITY.celebration,
    crossFade: 0.2,
    expression: "excited",
    procedural: ["blink"],
    autoReturn: true,
    label: "Celebration",
  },
};

/** Runtime guard for arbitrary (config/URL/JSON) input. */
export function isAvatarState(value: unknown): value is AvatarState {
  return typeof value === "string" && (AVATAR_STATES as readonly string[]).includes(value);
}

/** The preferred clip id for a state. */
export function clipIdForState(state: AvatarState): string {
  return STATE_PROFILES[state].clip;
}

/**
 * Resolve which clip to actually play for a state given the clips that loaded.
 *
 * Graceful-degradation contract:
 *   - `available` omitted → the preferred clip id (static mapping).
 *   - preferred clip present → the preferred clip id.
 *   - otherwise → the first id in `CLIP_FALLBACKS` that is present.
 *   - nothing usable → `null` (callers fall back to procedural idle).
 *
 * Never throws, including for an empty/undefined clip set or an unknown state.
 */
export function resolveClip(
  state: AvatarState,
  available?: readonly string[] | ReadonlySet<string>,
): string | null {
  const profile: AvatarStateProfile | undefined = STATE_PROFILES[state];
  const wanted = profile ? profile.clip : null;
  if (!available) return wanted;

  const set = available instanceof Set ? available : new Set(available);
  if (wanted && set.has(wanted)) return wanted;
  for (const fallback of CLIP_FALLBACKS) {
    if (set.has(fallback)) return fallback;
  }
  return null;
}

/** Called on every accepted state transition. */
export type StateChangeHandler = (state: AvatarState, previous: AvatarState) => void;

export interface AvatarStateMachineOptions {
  /** Initial state. Defaults to `"idle"`. */
  initialState?: AvatarState;
  /** Whether auto-returning states fall back to `idle`. Defaults to `true`. */
  autoReturn?: boolean;
  /** Milliseconds before an auto-returning state falls back to `idle`. Defaults to `4000`. */
  autoReturnMs?: number;
  /** Called whenever the active state changes. */
  onStateChange?: StateChangeHandler;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * A tiny, framework-agnostic finite state machine for the avatar's behaviour.
 *
 * Rules enforced here (and covered by tests):
 *   1. A lower-priority `play` never interrupts a higher-priority state.
 *   2. Auto-returning states fall back to `idle` after `autoReturnMs`.
 *   3. Cross-fades are always clamped to 0.2–0.35s.
 */
export class AvatarStateMachine {
  private _state: AvatarState;
  private _previous: AvatarState;
  private _elapsedMs = 0;
  private _crossFadeMs: number;
  private _autoReturn: boolean;
  private _autoReturnMs: number;

  /** Callback invoked on every accepted transition. */
  onStateChange?: StateChangeHandler;

  constructor(options: AvatarStateMachineOptions = {}) {
    this._state = options.initialState ?? "idle";
    this._previous = this._state;
    this._autoReturn = options.autoReturn ?? true;
    this._autoReturnMs = Math.max(0, options.autoReturnMs ?? 4000);
    this._crossFadeMs = STATE_PROFILES[this._state].crossFade * 1000;
    this.onStateChange = options.onStateChange;
  }

  /** The currently active state. */
  get state(): AvatarState {
    return this._state;
  }

  /** The state active before the current one. */
  get previous(): AvatarState {
    return this._previous;
  }

  /** Priority of the active state. */
  get priority(): number {
    return STATE_PROFILES[this._state].priority;
  }

  /** Cross-fade applied on the most recent transition, in seconds. */
  get crossFadeSeconds(): number {
    return this._crossFadeMs / 1000;
  }

  /** Milliseconds elapsed since the last transition. */
  get elapsedMs(): number {
    return this._elapsedMs;
  }

  get isIdle(): boolean {
    return this._state === "idle";
  }

  get autoReturn(): boolean {
    return this._autoReturn;
  }

  set autoReturn(value: boolean) {
    this._autoReturn = value;
  }

  get autoReturnMs(): number {
    return this._autoReturnMs;
  }

  set autoReturnMs(value: number) {
    this._autoReturnMs = Math.max(0, value);
  }

  /**
   * Request a state. Returns `true` when the transition was accepted, `false`
   * when a higher-priority state was already active.
   */
  play(state: AvatarState): boolean {
    return this._transitionTo(state, STATE_PROFILES[state].crossFade * 1000, false);
  }

  /** Request a state with an explicit cross-fade (clamped to 0.2–0.35s). */
  crossFadeTo(state: AvatarState, seconds: number): boolean {
    const clamped = clamp(Number.isFinite(seconds) ? seconds : MAX_CROSSFADE_SECONDS, MIN_CROSSFADE_SECONDS, MAX_CROSSFADE_SECONDS);
    return this._transitionTo(state, clamped * 1000, false);
  }

  /** Advance the auto-return timer. Call once per frame with the frame delta (s). */
  update(delta: number): void {
    if (!Number.isFinite(delta) || delta <= 0) return;
    this._elapsedMs += delta * 1000;
    if (!this._autoReturn) return;
    if (!STATE_PROFILES[this._state].autoReturn) return;
    if (this._elapsedMs >= this._autoReturnMs) {
      this._transitionTo("idle", STATE_PROFILES.idle.crossFade * 1000, true);
    }
  }

  /** Force the machine back to `idle` without notifying listeners. */
  reset(): void {
    this._previous = this._state;
    this._state = "idle";
    this._elapsedMs = 0;
    this._crossFadeMs = STATE_PROFILES.idle.crossFade * 1000;
  }

  private _transitionTo(state: AvatarState, crossFadeMs: number, forced: boolean): boolean {
    if (state === this._state) {
      this._elapsedMs = 0;
      this._crossFadeMs = crossFadeMs;
      return true;
    }
    if (!forced && STATE_PROFILES[state].priority < STATE_PROFILES[this._state].priority) {
      return false;
    }
    this._previous = this._state;
    this._state = state;
    this._elapsedMs = 0;
    this._crossFadeMs = crossFadeMs;
    this.onStateChange?.(state, this._previous);
    return true;
  }
}
