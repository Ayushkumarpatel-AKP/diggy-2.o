/**
 * // INTERFACE FOR INTEGRATION
 * interface ScreenHeaderProps { icon: IconName; tone?: Tone; title: string; subtitle?: string;
 *   children?: ReactNode }
 * // END INTERFACE FOR INTEGRATION
 */
import type { ReactNode } from "react";

import { Icon, type IconName } from "../Icon.js";
import type { Tone } from "../theme.js";

export interface ScreenHeaderProps {
  icon: IconName;
  tone?: Tone;
  title: string;
  subtitle?: string;
  children?: ReactNode;
}

export function ScreenHeader({ icon, tone = "violet", title, subtitle, children }: ScreenHeaderProps) {
  return (
    <header className="dg-screen-header">
      <span className={`dg-screen-header__icon dg-tone-${tone}`}>
        <Icon name={icon} size={18} />
      </span>
      <div className="dg-screen-header__titles">
        <h1 className="dg-screen-header__title">{title}</h1>
        {subtitle ? <p className="dg-screen-header__subtitle">{subtitle}</p> : null}
      </div>
      {children ? <div className="dg-screen-header__actions">{children}</div> : null}
    </header>
  );
}
