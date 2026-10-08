/**
 * Inline SVG icon set — no runtime dependency, uses `currentColor`.
 *
 * // INTERFACE FOR INTEGRATION
 * type IconName = keyof typeof ICON_PATHS;
 * interface IconProps { name: IconName; size?: number; strokeWidth?: number; className?: string; title?: string; }
 * function Icon(props: IconProps): JSX.Element;
 * // END INTERFACE FOR INTEGRATION
 */
import type { CSSProperties } from "react";

export const ICON_PATHS = {
  home: "M4 10.5 12 4l8 6.5M6 9.5V20h12V9.5",
  assistant:
    "M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7A2.5 2.5 0 0 1 17.5 16H9l-5 4zM12 6.6l.9 2.2 2.2.9-2.2.9-.9 2.2-.9-2.2-2.2-.9 2.2-.9z",
  monitor: "M3 5h18v11H3zM8 20h8M12 16v4",
  actions:
    "M9 4h6v3H9zM6.5 5H8v2h8V5h1.5A1.5 1.5 0 0 1 19 6.5v13A1.5 1.5 0 0 1 17.5 21h-11A1.5 1.5 0 0 1 5 19.5v-13A1.5 1.5 0 0 1 6.5 5ZM9 13.5l2 2 4-4.2",
  integrations:
    "M4 4h6.2v6.2H4zM13.8 4H20v6.2h-6.2zM4 13.8h6.2V20H4zM13.8 13.8H20V20h-6.2z",
  vault: "M12 3 5 6v6c0 4.2 2.9 6.9 7 9 4.1-2.1 7-4.8 7-9V6zM10 12.2h4V15h-4zM10.6 12.2v-1.1a1.4 1.4 0 0 1 2.8 0v1.1",
  activity: "M4 19V5M4 19h16M8.5 16v-4.2M12.5 16V8.4M16.5 16v-6.2",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20.5 20.5 16 16",
  bell: "M6 16v-5a6 6 0 0 1 12 0v5l1.6 2.6H4.4zM10 21a2 2 0 0 0 4 0",
  more: "M12 5.2a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2ZM12 10.9a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2ZM12 16.6a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2Z",
  plus: "M12 5v14M5 12h14",
  check: "m5 12.6 4.6 4.4L19 7",
  chevronDown: "m6 9 6 6 6-6",
  chevronRight: "m9 6 6 6-6 6",
  sparkle: "m12 3 1.9 5.3L19 10l-5.1 1.7L12 17l-1.9-5.3L5 10l5.1-1.7z",
  moon: "M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z",
  sun: "M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2ZM12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6",
  mic: "M12 3.2a2.9 2.9 0 0 1 2.9 2.9v5a2.9 2.9 0 0 1-5.8 0v-5A2.9 2.9 0 0 1 12 3.2ZM5.2 11.4a6.8 6.8 0 0 0 13.6 0M12 18.2V21",
  paperclip:
    "M20 11.4 12.1 19.3a4.6 4.6 0 0 1-6.5-6.5l8-8a3.1 3.1 0 0 1 4.4 4.4l-8 8a1.6 1.6 0 0 1-2.2-2.2l7.1-7.1",
  send: "M21.5 2.5 11 13M21.5 2.5l-6.8 19-3.7-8.5-8.5-3.7z",
  gear: "M12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6ZM12 2.2v2.6M12 19.2v2.6M2.2 12h2.6M19.2 12h2.6M5.1 5.1l1.9 1.9M17 17l1.9 1.9M18.9 5.1 17 7M7 17l-1.9 1.9",
  popout: "M14 4h6v6M20 4l-7.5 7.5M10 6H6.5A2.5 2.5 0 0 0 4 8.5v9A2.5 2.5 0 0 0 6.5 20h9a2.5 2.5 0 0 0 2.5-2.5V14",
  close: "M6 6l12 12M18 6 6 18",
  arrowRight: "M4 12h15M13.5 6.5 19 12l-5.5 5.5",
  edit: "M4 20h4L20 8.5 15.5 4 4 15.5zM14.5 5.5 18.5 9.5",
  clock: "M12 3.2a8.8 8.8 0 1 0 0 17.6 8.8 8.8 0 0 0 0-17.6ZM12 7.6V12l3 1.8",
  alert: "M12 3.6 3.2 19.4h17.6zM12 9.6v4.4M12 16.6h.01",
  lock: "M5.5 11h13v9.4h-13zM8.6 11V7.9a3.4 3.4 0 0 1 6.8 0V11",
  file: "M7 3h7.5L19 7.5V21H7zM14 3v5h5",
  layers: "m12 3 9 4.8-9 4.8-9-4.8zM3 12.6l9 4.8 9-4.8M3 16.8l9 4.8 9-4.8",
  globe:
    "M12 3.2a8.8 8.8 0 1 0 0 17.6 8.8 8.8 0 0 0 0-17.6ZM3.4 12h17.2M12 3.2c2.4 2.3 3.8 5.4 3.8 8.8s-1.4 6.5-3.8 8.8c-2.4-2.3-3.8-5.4-3.8-8.8S9.6 5.5 12 3.2Z",
  refresh: "M20 12a8 8 0 1 1-2.3-5.6M20 3.6v5h-5",
  star: "m12 3.4 2.6 5.4 5.9.9-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.9z",
  trendUp: "M3 17 10 10l4 4 7-7M15.5 7H21v5.5",
  box: "m12 3 8 4.5v9L12 21l-8-4.5v-9zM4 7.5 12 12l8-4.5M12 12v9",
  calendar: "M4 5.5h16V20H4zM4 9.9h16M8.4 3.4v4.2M15.6 3.4v4.2",
  trash: "M5 6.8h14M9.6 6.8V4.6h4.8v2.2M6.6 6.8 7.7 21h8.6l1.1-14.2",
  filter: "M4 5h16l-6.2 7.2V19l-3.6-1.8v-5z",
  user: "M12 12.2a3.9 3.9 0 1 0 0-7.8 3.9 3.9 0 0 0 0 7.8ZM5 20.4a7 7 0 0 1 14 0",
  briefcase: "M4 7.8h16V19H4zM9 7.8V5.6h6v2.2M4 12.6h16",
  link: "M10.2 13.8a3.9 3.9 0 0 0 5.6 0l2.2-2.2a3.9 3.9 0 0 0-5.6-5.6l-1.2 1.2M13.8 10.2a3.9 3.9 0 0 0-5.6 0l-2.2 2.2a3.9 3.9 0 0 0 5.6 5.6l1.2-1.2",
  shieldWarn: "M12 3 5 6v6c0 4.2 2.9 6.9 7 9 4.1-2.1 7-4.8 7-9V6zM12 8.4v4.2M12 15.6h.01",
  share: "M12 15.5V3.6M7.6 7.6 12 3.2l4.4 4.4M5 14v6.4h14V14",
  eye: "M2.6 12S6 5.6 12 5.6 21.4 12 21.4 12 18 18.4 12 18.4 2.6 12 2.6 12ZM12 9.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8Z",
} as const;

export type IconName = keyof typeof ICON_PATHS;

/** Icons drawn as filled dots rather than stroked outlines. */
const FILLED: ReadonlySet<IconName> = new Set<IconName>(["more"]);

export interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  title?: string;
  style?: CSSProperties;
}

export function Icon({ name, size = 18, strokeWidth = 1.7, className, title, style }: IconProps) {
  const filled = FILLED.has(name);
  return (
    <svg
      className={className ? `dg-icon ${className}` : "dg-icon"}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      style={style}
    >
      {title ? <title>{title}</title> : null}
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}
