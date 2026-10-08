/**
 * // INTERFACE FOR INTEGRATION
 * type Severity = "info" | "low" | "medium" | "high" | "critical";
 * interface AlertRowProps { icon?: IconName; tone?: Tone; title: ReactNode; subtitle?: ReactNode;
 *   time?: string; severity?: Severity; onClick?: () => void }
 * // END INTERFACE FOR INTEGRATION
 */
import type { ReactNode } from "react";

import { Icon, type IconName } from "../Icon.js";
import type { Tone } from "../theme.js";

export type Severity = "info" | "low" | "medium" | "high" | "critical";

const SEVERITY_DOT: Record<Severity, string> = {
  info: "dg-dot--info",
  low: "dg-dot--muted",
  medium: "dg-dot--warning",
  high: "dg-dot--danger",
  critical: "dg-dot--danger",
};

export interface AlertRowProps {
  icon?: IconName;
  tone?: Tone;
  title: ReactNode;
  subtitle?: ReactNode;
  time?: string;
  severity?: Severity;
  onClick?: () => void;
}

export function AlertRow({
  icon,
  tone = "warning",
  title,
  subtitle,
  time,
  severity = "info",
  onClick,
}: AlertRowProps) {
  return (
    <div className="dg-alert" onClick={onClick} role={onClick ? "button" : undefined}>
      {icon ? (
        <span className={`dg-row__lead dg-tone-${tone}`}>
          <Icon name={icon} size={17} />
        </span>
      ) : null}
      <div className="dg-row__body">
        <div className="dg-row__title">
          <span>{title}</span>
        </div>
        {subtitle ? <div className="dg-row__sub">{subtitle}</div> : null}
      </div>
      <div className="dg-row__trail">
        {time ? <span className="dg-row__time">{time}</span> : null}
        <span className={`dg-dot ${SEVERITY_DOT[severity]}`} aria-hidden="true" />
      </div>
    </div>
  );
}
