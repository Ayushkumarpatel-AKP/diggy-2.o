/**
 * // INTERFACE FOR INTEGRATION
 * type ButtonVariant = "primary" | "soft" | "outline" | "ghost";
 * interface ButtonProps { variant?: ButtonVariant; size?: "sm" | "md"; icon?: IconName;
 *   trailingIcon?: IconName; children?: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>;
 * // END INTERFACE FOR INTEGRATION
 */
import type { ButtonHTMLAttributes } from "react";

import { Icon, type IconName } from "../Icon.js";

export type ButtonVariant = "primary" | "soft" | "outline" | "ghost";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md";
  icon?: IconName;
  trailingIcon?: IconName;
}

export function Button({
  variant = "soft",
  size = "md",
  icon,
  trailingIcon,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  const classes = [
    "dg-btn",
    `dg-btn--${variant}`,
    size === "sm" ? "dg-btn--sm" : "",
    className ?? "",
  ]
    .join(" ")
    .trim();
  return (
    <button type={type} className={classes} {...rest}>
      {icon ? <Icon name={icon} size={15} /> : null}
      {children}
      {trailingIcon ? <Icon name={trailingIcon} size={15} /> : null}
    </button>
  );
}
