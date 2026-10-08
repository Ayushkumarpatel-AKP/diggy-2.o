/**
 * Design-system theme — the single bridge between `@diggy/shared` tokens and the stylesheet.
 *
 * `styles.css` declares the same values as CSS custom properties so components stay
 * class-driven; `tokenCssVariables()` re-derives them from `tokens` (source of truth) so a
 * consumer can re-apply or override the palette at runtime without duplicating literals.
 *
 * // INTERFACE FOR INTEGRATION
 * type Tone = "primary" | "blue" | "pink" | "mint" | "violet" | "success" | "warning"
 *            | "danger" | "muted";
 * const TONES: readonly Tone[];
 * tokenCssVariables(): Record<`--dg-${string}`, string>;   // spread onto :root / a wrapper
 * applyTokens(el?: HTMLElement): () => void;               // set + teardown
 * // END INTERFACE FOR INTEGRATION
 */
import { tokens } from "@diggy/shared";

export type Tone =
  | "primary"
  | "blue"
  | "pink"
  | "mint"
  | "violet"
  | "success"
  | "warning"
  | "danger"
  | "muted";

export const TONES: readonly Tone[] = [
  "primary",
  "blue",
  "pink",
  "mint",
  "violet",
  "success",
  "warning",
  "danger",
  "muted",
];

/** CSS custom properties keyed by the `--dg-*` names used across `styles.css`. */
export function tokenCssVariables(): Record<string, string> {
  const { color, radius, shadow, font } = tokens;
  return {
    "--dg-bg": color.bg,
    "--dg-surface": color.surface,
    "--dg-surface-alt": color.surfaceAlt,
    "--dg-ink": color.ink,
    "--dg-ink-soft": color.inkSoft,
    "--dg-muted": color.muted,
    "--dg-line": color.line,
    "--dg-primary": color.primary,
    "--dg-primary-ink": color.primaryInk,
    "--dg-blue": color.blue,
    "--dg-pink": color.pink,
    "--dg-mint": color.mint,
    "--dg-violet": color.violet,
    "--dg-success": color.success,
    "--dg-warning": color.warning,
    "--dg-danger": color.danger,
    "--dg-browser-red": color.browserRed,
    "--dg-browser-yellow": color.browserYellow,
    "--dg-browser-green": color.browserGreen,
    "--dg-radius-sm": radius.sm,
    "--dg-radius-md": radius.md,
    "--dg-radius-lg": radius.lg,
    "--dg-radius-xl": radius.xl,
    "--dg-radius-pill": radius.pill,
    "--dg-shadow-sm": shadow.sm,
    "--dg-shadow-md": shadow.md,
    "--dg-shadow-lg": shadow.lg,
    "--dg-font": font.sans,
  };
}

/** Apply the token values to an element's inline style; returns a teardown that restores it. */
export function applyTokens(el?: HTMLElement): () => void {
  const target = el ?? (typeof document !== "undefined" ? document.documentElement : undefined);
  if (!target) return () => {};
  const vars = tokenCssVariables();
  const previous = new Map<string, string>();
  for (const [key, value] of Object.entries(vars)) {
    previous.set(key, target.style.getPropertyValue(key));
    target.style.setProperty(key, value);
  }
  return () => {
    for (const [key, value] of previous) {
      if (value) target.style.setProperty(key, value);
      else target.style.removeProperty(key);
    }
  };
}

export { tokens };
