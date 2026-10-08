/**
 * Push-to-talk shortcut logic — pure, DOM-free and unit-tested.
 *
 * // INTERFACE FOR INTEGRATION
 * function shortcutParts(spec: string): string[];
 * function matchesShortcut(event: { code; key; ctrlKey; shiftKey; altKey }, spec: string): boolean;
 * function isChordRelease(event: { code; key }, spec: string): boolean;
 * type PushToTalkIntent = "start" | "stop";
 * function commandIntent(commandId: string, active: boolean, spec?: string): PushToTalkIntent | null;
 * interface PushToTalkOptions { commandId?; onStart?; onStop?; }
 * class PushToTalkShortcut {
 *   readonly active: boolean;
 *   press(): boolean;                       // true when it opened the mic
 *   release(): boolean;                     // true when it closed the mic
 *   toggle(): void;
 *   handleCommand(command: string): void;   // maps a `commands` id → press/release
 * }
 * // END INTERFACE FOR INTEGRATION
 *
 * MV3 FACT: `chrome.commands` fires `onCommand` once on key-down and never on
 * key-up. A browser-level chord can therefore only *toggle*. Real hold-to-talk is
 * reachable from a page that already sees the keydown/keyup pair (the overlay /
 * side panel, via `matchesShortcut` + `isChordRelease`), and the offscreen
 * recorder's silence detector ends the clip for a single command press.
 */
import { VOICE_COMMAND_ID } from "./protocol.js";

/** Minimal keyboard-event shape so this works with DOM events and test objects. */
export interface ShortcutEvent {
  code: string;
  key: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/** Split "Ctrl+Space" into `["ctrl", "space"]`. */
export function shortcutParts(spec: string): string[] {
  return spec
    .toLowerCase()
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Does this keydown event match a chord like "Ctrl+Space"? */
export function matchesShortcut(event: ShortcutEvent, spec: string): boolean {
  const parts = shortcutParts(spec);
  if (parts.length === 0) return false;
  const main = parts[parts.length - 1];
  const mainOk = main === "space" ? event.code === "Space" : event.key.toLowerCase() === main;
  return (
    mainOk &&
    event.ctrlKey === parts.includes("ctrl") &&
    event.shiftKey === parts.includes("shift") &&
    event.altKey === parts.includes("alt")
  );
}

/** Is this keyup the end of the chord (so the mic should close)? */
export function isChordRelease(event: { code: string; key: string }, spec: string): boolean {
  const parts = shortcutParts(spec);
  const key = event.key.toLowerCase();
  if (parts.includes("ctrl") && key === "control") return true;
  if (parts.includes("shift") && key === "shift") return true;
  if (parts.includes("alt") && key === "alt") return true;
  const main = parts[parts.length - 1];
  if (main === "space") return event.code === "Space";
  return key === main;
}

/** What a shortcut gesture should do next. */
export type PushToTalkIntent = "start" | "stop";

/**
 * Map a command id + current activity to a press/release intent.
 *
 * Returns `null` for an unrelated command so callers can ignore it. When the
 * command matches, it toggles (the only thing MV3 allows at browser level).
 */
export function commandIntent(
  commandId: string,
  active: boolean,
  spec: string = VOICE_COMMAND_ID,
): PushToTalkIntent | null {
  if (commandId !== spec) return null;
  return active ? "stop" : "start";
}

export interface PushToTalkOptions {
  /** The manifest command id to react to. Defaults to `VOICE_COMMAND_ID`. */
  commandId?: string;
  /** Called when the mic should open. */
  onStart?: () => void;
  /** Called when the mic should close (and the clip be transcribed). */
  onStop?: () => void;
}

/**
 * A tiny, idempotent press/release gate.
 *
 * `press()` while already listening is a no-op, and a second `release()` never
 * double-fires — the browser command, a page key-up and a silence auto-stop can
 * all race to end the same recording, and only one of them should win.
 */
export class PushToTalkShortcut {
  private readonly _commandId: string;
  private readonly _onStart?: () => void;
  private readonly _onStop?: () => void;
  private _active = false;

  constructor(options: PushToTalkOptions = {}) {
    this._commandId = options.commandId ?? VOICE_COMMAND_ID;
    this._onStart = options.onStart;
    this._onStop = options.onStop;
  }

  /** True while the mic is open. */
  get active(): boolean {
    return this._active;
  }

  /** Open the mic. Returns `true` when this call started it. */
  press(): boolean {
    if (this._active) return false;
    this._active = true;
    this._onStart?.();
    return true;
  }

  /** Close the mic. Returns `true` when this call stopped it. */
  release(): boolean {
    if (!this._active) return false;
    this._active = false;
    this._onStop?.();
    return true;
  }

  /** Toggle (what the browser-level command does). */
  toggle(): void {
    if (this._active) this.release();
    else this.press();
  }

  /** React to a `commands.onCommand` id. */
  handleCommand(command: string): void {
    const intent = commandIntent(command, this._active, this._commandId);
    if (intent === "start") this.press();
    else if (intent === "stop") this.release();
  }
}
