/**
 * // INTERFACE FOR INTEGRATION
 * interface ListRowProps { icon?: IconName; tone?: Tone; lead?: ReactNode; title: ReactNode;
 *   subtitle?: ReactNode; tags?: ReactNode; trail?: ReactNode; onClick?: () => void }
 * // END INTERFACE FOR INTEGRATION
 */
import type { ReactNode } from "react";

import { Icon, type IconName } from "../Icon.js";
import type { Tone } from "../theme.js";

export interface ListRowProps {
  icon?: IconName;
  tone?: Tone;
  lead?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  tags?: ReactNode;
  trail?: ReactNode;
  onClick?: () => void;
  className?: string;
}

export function ListRow({
  icon,
  tone = "blue",
  lead,
  title,
  subtitle,
  tags,
  trail,
  onClick,
  className,
}: ListRowProps) {
  const classes = ["dg-row", onClick ? "dg-row--interactive" : "", className ?? ""]
    .join(" ")
    .trim();
  return (
    <div className={classes} onClick={onClick} role={onClick ? "button" : undefined}>
      {lead ?? (icon ? (
        <span className={`dg-row__lead dg-tone-${tone}`}>
          <Icon name={icon} size={17} />
        </span>
      ) : null)}
      <div className="dg-row__body">
        <div className="dg-row__title">{title}</div>
        {subtitle ? <div className="dg-row__sub">{subtitle}</div> : null}
        {tags ? <div className="dg-row__tags">{tags}</div> : null}
      </div>
      {trail ? <div className="dg-row__trail">{trail}</div> : null}
    </div>
  );
}
