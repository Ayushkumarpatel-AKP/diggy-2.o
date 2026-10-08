/**
 * // INTERFACE FOR INTEGRATION
 * type ButtonVariant = "primary" | "soft" | "outline" | "ghost";
 * interface ButtonProps { variant?: ButtonVariant; size?: "sm" | "md"; icon?: IconName;
 *   trailingIcon?: IconName; disabledReason?: string; children?: ReactNode }
 *   & ButtonHTMLAttributes<HTMLButtonElement>;
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
  /** When set, the button is disabled and explains why (title + aria-disabled). */
  disabledReason?: string;
}

export function Button({
  variant = "soft",
  size = "md",
  icon,
  trailingIcon,
  disabledReason,
  disabled,
  title,
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
  const isDisabled = Boolean(disabledReason) || Boolean(disabled);
  return (
    <button
      type={type}
      className={classes}
      disabled={isDisabled}
      aria-disabled={isDisabled || undefined}
      title={disabledReason ?? title}
      {...rest}
    >
      {icon ? <Icon name={icon} size={15} /> : null}
      {children}
      {trailingIcon ? <Icon name={trailingIcon} size={15} /> : null}
    </button>
  );
}
