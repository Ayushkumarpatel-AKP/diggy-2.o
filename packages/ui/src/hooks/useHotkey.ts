/**
 * // INTERFACE FOR INTEGRATION
 * function useHotkey(combo: string, handler: (event: KeyboardEvent) => void,
 *   options?: { enabled?: boolean; preventDefault?: boolean }): void;
 * // combos: "alt+k", "alt+space", "mod+k" (mod = ⌘ on mac, ctrl elsewhere), "shift+?"
 * // END INTERFACE FOR INTEGRATION
 */
import { useEffect, useRef } from "react";

export interface HotkeyOptions {
  enabled?: boolean;
  preventDefault?: boolean;
}

const IS_MAC =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform ?? "");

function parseCombo(combo: string) {
  const parts = combo.toLowerCase().split("+").map((part) => part.trim());
  const key = parts[parts.length - 1] ?? "";
  return {
    key,
    alt: parts.includes("alt"),
    ctrl: parts.includes("ctrl"),
    meta: parts.includes("meta") || parts.includes("cmd"),
    shift: parts.includes("shift"),
    mod: parts.includes("mod"),
  };
}

export function useHotkey(
  combo: string,
  handler: (event: KeyboardEvent) => void,
  options: HotkeyOptions = {},
): void {
  const { enabled = true, preventDefault = true } = options;
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const spec = parseCombo(combo);

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase().replace("spacebar", " ");
      const normalized = spec.key === "space" ? " " : spec.key;
      if (key !== normalized) return;

      const modOk = spec.mod ? (IS_MAC ? event.metaKey : event.ctrlKey) : true;
      if (
        event.altKey !== spec.alt ||
        event.ctrlKey !== (spec.ctrl || (spec.mod && !IS_MAC)) ||
        event.metaKey !== (spec.meta || (spec.mod && IS_MAC)) ||
        event.shiftKey !== spec.shift ||
        !modOk
      ) {
        return;
      }

      if (preventDefault) event.preventDefault();
      handlerRef.current(event);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [combo, enabled, preventDefault]);
}
