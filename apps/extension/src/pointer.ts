/**
 * The visible pointer — the model's "hands", made watchable.
 *
 * Everything here is pure so it can be unit-tested without a browser: the
 * content script owns the DOM, and this module owns the *state* of the pointer
 * (where it is, what it is doing, whether it is visible). The pointer is driven
 * only by real engine events — the background never tells it to move unless an
 * action actually happened, so it can never show a click that did not occur.
 */

/** What the pointer is doing. */
export type PointerAction = "move" | "click" | "type" | "scroll" | "nav" | "idle";

/** A viewport-relative box, matching `ActionResult.target.bbox`. */
export interface PointerBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One pointer instruction, as sent to the content script. */
export interface PointerEvent {
  action: PointerAction;
  bbox?: PointerBox;
  label?: string;
}

/** The message shape over the wire. */
export interface PointerMessage extends PointerEvent {
  type: "diggy:pointer";
}

/** The pointer's current state. */
export interface PointerState {
  action: PointerAction;
  visible: boolean;
  bbox?: PointerBox;
  label: string;
  /** Bumped on every event, so the content script can restart animations. */
  seq: number;
}

/** How long the pointer lingers after an action before fading (ms). */
export const POINTER_HIDE_MS = 1800;

/** Which pointer action a page tool maps to. */
export function pointerActionForTool(name: string): PointerAction {
  switch (name) {
    case "click":
    case "submit":
      return "click";
    case "type":
    case "fill":
    case "select":
      return "type";
    case "scroll":
      return "scroll";
    case "navigate":
    case "goBack":
      return "nav";
    default:
      return "move";
  }
}

/** The starting state: nothing shown. */
export function initialPointerState(): PointerState {
  return { action: "idle", visible: false, label: "", seq: 0 };
}

/**
 * Fold one event into the state.
 *
 * A box-less event keeps the last position (a scroll, or a navigation where the
 * target moved the page) so the pointer does not jump to the corner. `idle`
 * hides it.
 */
export function reducePointer(state: PointerState, event: PointerEvent): PointerState {
  const seq = state.seq + 1;
  if (event.action === "idle") {
    return { action: "idle", visible: false, label: "", seq };
  }
  const bbox = event.bbox ?? state.bbox;
  return {
    action: event.action,
    visible: true,
    ...(bbox ? { bbox } : {}),
    label: event.label ?? "",
    seq,
  };
}
