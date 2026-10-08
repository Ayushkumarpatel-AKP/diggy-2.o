/**
 * Design tokens — source of truth is `diggy motion/Diggy Pastel Productivity Dashboard.png`.
 * Light pastel surfaces, rounded cards, amber/gold primary.
 */
export const tokens = {
  color: {
    bg: "#F7F8FA",
    surface: "#FFFFFF",
    surfaceAlt: "#FBFBFD",
    ink: "#111827",
    inkSoft: "#374151",
    muted: "#6B7280",
    line: "#E5E7EB",
    primary: "#F5B301",
    primaryInk: "#7A5A00",
    blue: "#4A7BF7",
    pink: "#FB7185",
    mint: "#34D399",
    violet: "#A78BFA",
    success: "#22C55E",
    warning: "#F59E0B",
    danger: "#EF4444",
    browserRed: "#FF5F57",
    browserYellow: "#FEBC2E",
    browserGreen: "#28C840",
  },
  radius: {
    sm: "8px",
    md: "12px",
    lg: "16px",
    xl: "24px",
    pill: "999px",
  },
  shadow: {
    sm: "0 1px 2px rgba(17,24,39,0.06)",
    md: "0 4px 16px rgba(17,24,39,0.08)",
    lg: "0 12px 32px rgba(17,24,39,0.10)",
  },
  font: {
    sans: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
  },
} as const;

export type Tokens = typeof tokens;
