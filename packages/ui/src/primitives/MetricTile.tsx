/**
 * // INTERFACE FOR INTEGRATION
 * interface MetricTileProps { icon: IconName; tone?: Tone; value: ReactNode; label: string;
 *   sub?: { text: string; tone?: Tone }; onClick?: () => void }
 * // END INTERFACE FOR INTEGRATION
 */
import type { ReactNode } from "react";

import { Icon, type IconName } from "../Icon.js";
import { Pill } from "./Pill.js";
import type { Tone } from "../theme.js";

export interface MetricTileProps {
  icon: IconName;
  tone?: Tone;
  value: ReactNode;
  label: string;
  sub?: { text: string; tone?: Tone };
  onClick?: () => void;
}

export function MetricTile({ icon, tone = "blue", value, label, sub, onClick }: MetricTileProps) {
  const classes = ["dg-tile", onClick ? "dg-tile--interactive" : ""].join(" ").trim();
  return (
    <button type="button" className={classes} onClick={onClick} disabled={!onClick}>
      <span className={`dg-tile__icon dg-tone-${tone}`}>
        <Icon name={icon} size={19} />
      </span>
      <span className="dg-tile__body">
        <span className="dg-tile__value">{value}</span>
        <span className="dg-tile__label">{label}</span>
        {sub ? (
          <span className="dg-tile__sub">
            <Pill tone={sub.tone ?? tone} dot>
              {sub.text}
            </Pill>
          </span>
        ) : null}
      </span>
    </button>
  );
}
