/**
 * // INTERFACE FOR INTEGRATION
 * interface QuickActionProps { icon: IconName; tone?: Tone; label: string; onClick?: () => void }
 * // END INTERFACE FOR INTEGRATION
 */
import { Icon, type IconName } from "../Icon.js";
import type { Tone } from "../theme.js";

export interface QuickActionProps {
  icon: IconName;
  tone?: Tone;
  label: string;
  onClick?: () => void;
}

/** Quick Commands tile (Home): Summarize page · Track this site · Fill form · Explain page. */
export function QuickAction({ icon, tone = "violet", label, onClick }: QuickActionProps) {
  return (
    <button type="button" className="dg-quick" onClick={onClick}>
      <span className={`dg-quick__icon dg-tone-${tone}`}>
        <Icon name={icon} size={16} />
      </span>
      {label}
    </button>
  );
}
