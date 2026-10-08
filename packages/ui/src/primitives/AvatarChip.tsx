/**
 * // INTERFACE FOR INTEGRATION
 * interface AvatarChipProps { initials: string; name?: string; role?: string; size?: "sm" | "md";
 *   leading?: ReactNode; showGear?: boolean; onClick?: () => void }
 * // END INTERFACE FOR INTEGRATION
 */
import type { ReactNode } from "react";

import { Icon } from "../Icon.js";

export interface AvatarChipProps {
  initials: string;
  name?: string;
  role?: string;
  size?: "sm" | "md";
  leading?: ReactNode;
  showGear?: boolean;
  onClick?: () => void;
}

export function AvatarChip({
  initials,
  name,
  role,
  size = "md",
  leading,
  showGear,
  onClick,
}: AvatarChipProps) {
  const avatar = (
    <span className={size === "sm" ? "dg-avatar dg-avatar--sm" : "dg-avatar"} aria-hidden="true">
      {leading ?? initials}
    </span>
  );
  if (!name && !showGear) return avatar;
  return (
    <button type="button" className="dg-avatar-chip" onClick={onClick}>
      {avatar}
      {name ? (
        <span className="dg-avatar-chip__meta">
          <span className="dg-avatar-chip__name">{name}</span>
          {role ? <span className="dg-avatar-chip__role">{role}</span> : null}
        </span>
      ) : null}
      {showGear ? <Icon name="gear" size={16} /> : null}
    </button>
  );
}
