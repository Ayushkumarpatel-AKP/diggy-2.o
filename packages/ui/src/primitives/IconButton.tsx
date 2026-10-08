/**
 * // INTERFACE FOR INTEGRATION
 * interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { icon: IconName;
 *   label: string; size?: number; outline?: boolean }
 * // END INTERFACE FOR INTEGRATION
 */
import type { ButtonHTMLAttributes } from "react";

import { Icon, type IconName } from "../Icon.js";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  label: string;
  size?: number;
  outline?: boolean;
}

export function IconButton({
  icon,
  label,
  size = 16,
  outline,
  className,
  type = "button",
  ...rest
}: IconButtonProps) {
  const classes = ["dg-iconbtn", outline ? "dg-iconbtn--outline" : "", className ?? ""]
    .join(" ")
    .trim();
  return (
    <button type={type} className={classes} aria-label={label} title={label} {...rest}>
      <Icon name={icon} size={size} />
    </button>
  );
}
