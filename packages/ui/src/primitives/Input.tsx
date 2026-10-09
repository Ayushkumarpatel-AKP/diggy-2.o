/**
 * // INTERFACE FOR INTEGRATION
 * interface InputProps extends InputHTMLAttributes<HTMLInputElement> { icon?: IconName;
 *   trailing?: ReactNode; wrapperClassName?: string }
 * function SearchField(props: { value?: string; onChange?: (v: string) => void;
 *   placeholder?: string; hint?: string; onActivate?: () => void }): JSX.Element;
 * // END INTERFACE FOR INTEGRATION
 */
import type { InputHTMLAttributes, ReactNode } from "react";

import { Icon, type IconName } from "../Icon.js";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: IconName;
  trailing?: ReactNode;
  wrapperClassName?: string;
}

export function Input({ icon, trailing, wrapperClassName, className, ...rest }: InputProps) {
  return (
    <div className={["dg-search", wrapperClassName ?? ""].join(" ").trim()}>
      {icon ? <Icon name={icon} size={16} /> : null}
      <input className={className} {...rest} />
      {trailing}
    </div>
  );
}

export interface SearchFieldProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  hint?: string;
  onActivate?: () => void;
  readOnly?: boolean;
  className?: string;
}

/** Read-only-friendly search affordance that opens the command palette on click. */
export function SearchField({
  value,
  onChange,
  placeholder = "Search or ask DIGGY…",
  hint = "Ctrl K",
  onActivate,
  readOnly,
  className,
}: SearchFieldProps) {
  return (
    <div
      className={["dg-search", className ?? ""].join(" ").trim()}
      onClick={onActivate}
      role={onActivate ? "button" : undefined}
      style={onActivate ? { cursor: "pointer" } : undefined}
    >
      <Icon name="search" size={16} />
      <input
        value={value ?? ""}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        aria-label={placeholder}
      />
      {hint ? <span className="dg-kbd">{hint}</span> : null}
    </div>
  );
}
