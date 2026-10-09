/**
 * DIGGY animation catalogue — the single source of truth for the character.
 *
 * ## Where the files live
 *
 * `assets/avatar/diggy_U.vrm`                        the character
 * `assets/avatar/animations/<File>.vrma`             11 VRM animation clips
 * (mirrored into `apps/extension/public/assets/avatar/…` so the extension can
 *  serve them; both copies are kept in sync by `scripts/sync-avatar.mjs`)
 *
 * ## Which animation plays when
 *
 * Each entry lists the `AvatarState`s that play it. `ANIMATIONS.md` (repo root)
 * renders this same table for a human — **to ask for a change, name the
 * animation** (e.g. "Goodbye should also play on warning").
 *
 * ## Shipped clips (11)
 * Angry · Blush · Clapping · Goodbye · Jump · LookAround · Relax · Sad ·
 * Sleepy · Surprised · Thinking
 *
 * Two of them are intentionally not wired to a state yet — **Sad** and (when
 * `warning` uses Surprised) **Angry** — plus the procedural entrance/walk and
 * the procedural idle layers, which are code rather than clips.
 */
import type { AvatarState } from "@diggy/shared";

export interface AvatarAnimation {
  /** Stable id used by the state machine (kebab-case). */
  readonly id: string;
  /** Exact file name under `assets/avatar/animations/`. */
  readonly file: string;
  /** Human-facing label (matches the file, for easy referencing). */
  readonly label: string;
  /** Loop it (idle-like) or play it once (one-shot). */
  readonly loop: boolean;
  /** Avatar states that play this animation. */
  readonly states: readonly AvatarState[];
  /** VRM expression preset applied while it plays. */
  readonly expression?: string;
  /** One-line description. */
  readonly description: string;
}

/** Every shipped animation, in the order they are shown in the reference doc. */
export const AVATAR_ANIMATIONS: readonly AvatarAnimation[] = [
  {
    id: "relax",
    file: "Relax.vrma",
    label: "Relax",
    loop: true,
    // Stretch, not idle: this clip raises the arms, so it plays the `stretch`
    // beat. The idle stance itself is the renderer's procedural pose.
    states: ["stretch"],
    expression: "relaxed",
    description: "A stretch — arms up and settle. NOT the idle stance.",
  },
  {
    id: "lookaround",
    file: "LookAround.vrma",
    label: "LookAround",
    loop: true,
    states: ["listening"],
    expression: "neutral",
    description: "Glancing around — played while DIGGY is listening to you.",
  },
  {
    id: "thinking",
    file: "Thinking.vrma",
    label: "Thinking",
    loop: true,
    states: ["thinking"],
    expression: "neutral",
    description: "Hand to chin — played while DIGGY is working something out.",
  },
  {
    id: "blush",
    file: "Blush.vrma",
    label: "Blush",
    loop: true,
    states: ["speaking", "happy"],
    expression: "happy",
    description: "Warm and lively — the base for talking and for happy moments.",
  },
  {
    id: "clapping",
    file: "Clapping.vrma",
    label: "Clapping",
    loop: true,
    states: ["success"],
    expression: "happy",
    description: "Applauding — played when a task succeeds.",
  },
  {
    id: "jump",
    file: "Jump.vrma",
    label: "Jump",
    loop: false,
    states: ["celebration"],
    expression: "happy",
    description: "A celebratory jump — one-shot, played for wins.",
  },
  {
    id: "surprised",
    file: "Surprised.vrma",
    label: "Surprised",
    loop: false,
    states: ["warning"],
    expression: "surprised",
    description: "Startled — played as the alert/warning reaction.",
  },
  {
    id: "sleepy",
    file: "Sleepy.vrma",
    label: "Sleepy",
    loop: true,
    states: ["sleep"],
    expression: "relaxed",
    description: "Drowsy — played when DIGGY is idle for a long time.",
  },
  {
    id: "goodbye",
    file: "Goodbye.vrma",
    label: "Goodbye",
    loop: false,
    states: ["exit"],
    expression: "happy",
    description: "Waving goodbye — played when the companion leaves.",
  },
  {
    id: "angry",
    file: "Angry.vrma",
    label: "Angry",
    loop: false,
    // Not wired to a state yet — pick a state and it becomes reachable.
    states: [],
    expression: "angry",
    description: "Cross/irritated — **available but not wired to any state yet**.",
  },
  {
    id: "sad",
    file: "Sad.vrma",
    label: "Sad",
    loop: true,
    // Not wired to a state yet — pick a state and it becomes reachable.
    states: [],
    expression: "sad",
    description: "Downcast — **available but not wired to any state yet**.",
  },
];

/** Directory (relative to the asset base) holding the clips. */
export const ANIMATION_DIR = "animations";

/**
 * Graceful-degradation order. If a state's preferred clip is missing we fall back
 * through these before giving up (`resolveClip` then returns `null`, which callers
 * treat as "procedural idle only" — never an error).
 */
export const ANIMATION_FALLBACKS: readonly string[] = ["relax"];

/** Look up an animation by id. */
export function animationById(id: string): AvatarAnimation | undefined {
  return AVATAR_ANIMATIONS.find((animation) => animation.id === id);
}

/** The animation a state plays, if any (`entry`/`walk` are procedural). */
export function animationForState(state: AvatarState): AvatarAnimation | undefined {
  return AVATAR_ANIMATIONS.find((animation) => animation.states.includes(state));
}

/** The animation id a state plays, if any. */
export function animationIdForState(state: AvatarState): string | undefined {
  return animationForState(state)?.id;
}

/** All animation ids, in catalogue order. */
export function animationIds(): string[] {
  return AVATAR_ANIMATIONS.map((animation) => animation.id);
}

/**
 * States that play a real clip. Everything else (`entry`, `walk`, `blink`,
 * `breathing`) is driven procedurally, or falls back to `idle`.
 */
export const ANIMATED_STATES: readonly AvatarState[] = [
  ...new Set(AVATAR_ANIMATIONS.flatMap((animation) => animation.states)),
];
