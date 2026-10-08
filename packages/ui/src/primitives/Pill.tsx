/**
 * // INTERFACE FOR INTEGRATION
 * interface PillProps { tone?: Tone; outline?: boolean; dot?: boolean; icon?: IconName;
 *   className?: string; title?: string; children?: ReactNode }
 * // END INTERFACE FOR INTEGRATION
 */
import type { ReactNode } from "react";

import { Icon, type IconName } from "../Icon.js";
import type { Tone } from "../theme.js";

export interface PillProps {
  tone?: Tone;
  outline?: boolean;
  dot?: boolean;
  icon?: IconName;
  className?: string;
  title?: string;
  children?: ReactNode;
}

export function Pill({
  tone = "muted",
  outline,
  dot,
  icon,
  className,
  title,
  children,
}: PillProps) {
  const classes = [
    "dg-pill",
    outline ? "dg-pill--outline" : `dg-tone-${tone}`,
    className ?? "",
  ]
    .join(" ")
    .trim();
  return (
    <span className={classes} title={title}>
      {dot ? <span className="dg-pill__dot" /> : null}
      {icon ? <Icon name={icon} size={12} /> : null}
      {children}
    </span>
  );
}
