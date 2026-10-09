/**
 * Brand marks for the integrations catalog.
 *
 * Hand-drawn monogram tiles in the brand colour — never official logo files
 * (brand assets are trademarked). Each spec is `{ id, label, color, mark }`
 * and renders as a rounded tile with a short monogram or wordmark, matching
 * the look the integrations screen already uses.
 *
 * // INTERFACE FOR INTEGRATION
 * interface BrandMarkSpec { id: string; label: string; color: string; mark: string }
 * function BrandMark(props: BrandMarkProps): JSX.Element
 * const BRAND_MARKS: Record<string, BrandMarkSpec>
 * // END INTERFACE FOR INTEGRATION
 */

export interface BrandMarkSpec {
  id: string;
  label: string;
  color: string;
  mark: string;
}

export interface BrandMarkProps {
  /** Full spec, or an id present in {@link BRAND_MARKS}. */
  spec: BrandMarkSpec | string;
  size?: number;
  className?: string;
}

/**
 * Default catalog. Covers: Google (Gmail, Calendar), GitHub, Notion,
 * YouTube, Slack, Discord, Linear, Spotify.
 */
export const BRAND_MARKS: Record<string, BrandMarkSpec> = {
  gmail: { id: "gmail", label: "Gmail", color: "#EA4335", mark: "M" },
  calendar: { id: "calendar", label: "Google Calendar", color: "#4285F4", mark: "31" },
  github: { id: "github", label: "GitHub", color: "#24292F", mark: "GH" },
  notion: { id: "notion", label: "Notion", color: "#111111", mark: "N" },
  youtube: { id: "youtube", label: "YouTube", color: "#FF0000", mark: "▶" },
  slack: { id: "slack", label: "Slack", color: "#4A154B", mark: "S" },
  discord: { id: "discord", label: "Discord", color: "#5865F2", mark: "D" },
  linear: { id: "linear", label: "Linear", color: "#5E6AD2", mark: "L" },
  spotify: { id: "spotify", label: "Spotify", color: "#1DB954", mark: "Sp" },
};

/** Resolve a spec-or-id to a spec; unknown ids fall back to an initial tile. */
export function resolveBrandMark(spec: BrandMarkSpec | string): BrandMarkSpec {
  if (typeof spec !== "string") return spec;
  return (
    BRAND_MARKS[spec] ?? {
      id: spec,
      label: spec,
      color: "#6B7280",
      mark: spec.slice(0, 2).toUpperCase() || "?",
    }
  );
}

export function BrandMark({ spec, size = 40, className }: BrandMarkProps) {
  const resolved = resolveBrandMark(spec);
  const fontSize = resolved.mark.length > 2 ? size * 0.3 : size * 0.42;
  return (
    <span
      className={className ? `dg-intg__logo ${className}` : "dg-intg__logo"}
      style={{
        background: resolved.color,
        width: size,
        height: size,
        fontSize,
        fontWeight: 700,
        color: "#fff",
        letterSpacing: "0.02em",
      }}
      role="img"
      aria-label={resolved.label}
      title={resolved.label}
    >
      {resolved.mark}
    </span>
  );
}
