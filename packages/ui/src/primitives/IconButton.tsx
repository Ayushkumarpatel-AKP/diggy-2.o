/**
 * // INTERFACE FOR INTEGRATION
 * interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { icon: IconName;
 *   label: string; size?: number; outline?: boolean; disabledReason?: string }
 * // END INTERFACE FOR INTEGRATION
 */
import type { ButtonHTMLAttributes } from "react";

import { Icon, type IconName } from "../Icon.js";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  label: string;
  size?: number;
  outline?: boolean;
  /** When set, the button is disabled and explains why (title + aria-disabled). */
  disabledReason?: string;
}

export function IconButton({
  icon,
  label,
  size = 16,
  outline,
  disabledReason,
  disabled,
  title,
  className,
  type = "button",
  ...rest
}: IconButtonProps) {
  const classes = ["dg-iconbtn", outline ? "dg-iconbtn--outline" : "", className ?? ""]
    .join(" ")
    .trim();
  const isDisabled = Boolean(disabledReason) || Boolean(disabled);
  return (
    <button
      type={type}
      className={classes}
      aria-label={disabledReason ? `${label} (${disabledReason})` : label}
      title={disabledReason ?? title ?? label}
      disabled={isDisabled}
      aria-disabled={isDisabled || undefined}
      {...rest}
    >
      <Icon name={icon} size={size} />
    </button>
  );
}
