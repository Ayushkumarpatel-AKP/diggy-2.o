/**
 * // INTERFACE FOR INTEGRATION
 * interface SidebarProps { active: NavTabId; onSelect(id: NavTabId): void;
 *   user?: { initials: string; name?: string; role?: string };
 *   onSettings?: () => void; footer?: ReactNode }
 * // END INTERFACE FOR INTEGRATION
 */
import type { ReactNode } from "react";
import { NAV_TABS, type NavTabId } from "@diggy/shared";

import { DiggyLogo } from "../DiggyLogo.js";
import { Icon, type IconName } from "../Icon.js";
import { AvatarChip } from "../primitives/AvatarChip.js";

export interface SidebarProps {
  active: NavTabId;
  onSelect: (id: NavTabId) => void;
  user?: { initials: string; name?: string; role?: string };
  onSettings?: () => void;
  footer?: ReactNode;
}

export function Sidebar({ active, onSelect, user, onSettings, footer }: SidebarProps) {
  return (
    <aside className="dg-sidebar">
      <div className="dg-sidebar__brand">
        <DiggyLogo size={30} />
        <span className="dg-wordmark">Diggy</span>
      </div>

      <nav className="dg-nav" aria-label="Primary">
        {NAV_TABS.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              className={isActive ? "dg-nav__item dg-nav__item--active" : "dg-nav__item"}
              aria-current={isActive ? "page" : undefined}
              onClick={() => onSelect(tab.id)}
            >
              <Icon name={tab.icon as IconName} size={17} />
              {tab.label}
            </button>
          );
        })}
      </nav>

      <div className="dg-sidebar__spacer" />

      <div className="dg-sidebar__footer">
        {user ? (
          <AvatarChip
            initials={user.initials}
            name={user.name}
            role={user.role}
            onClick={onSettings}
          />
        ) : null}
        <button
          type="button"
          className="dg-iconbtn"
          aria-label="Settings"
          title="Settings"
          onClick={onSettings}
          style={{ marginLeft: "auto" }}
        >
          <Icon name="gear" size={16} />
        </button>
      </div>

      {footer}
    </aside>
  );
}
