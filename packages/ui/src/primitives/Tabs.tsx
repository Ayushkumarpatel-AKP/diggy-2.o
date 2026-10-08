/**
 * // INTERFACE FOR INTEGRATION
 * interface TabItem { id: string; label: string }
 * interface TabsProps { items: readonly TabItem[]; value: string; onChange: (id: string) => void;
 *   variant?: "pill" | "underline"; className?: string }
 * // END INTERFACE FOR INTEGRATION
 */

export interface TabItem {
  id: string;
  label: string;
}

export interface TabsProps {
  items: readonly TabItem[];
  value: string;
  onChange: (id: string) => void;
  variant?: "pill" | "underline";
  className?: string;
  ariaLabel?: string;
}

export function Tabs({ items, value, onChange, variant = "pill", className, ariaLabel }: TabsProps) {
  const classes = [
    "dg-tabs",
    variant === "underline" ? "dg-tabs--underline" : "",
    className ?? "",
  ]
    .join(" ")
    .trim();
  return (
    <div className={classes} role="tablist" aria-label={ariaLabel}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={item.id === value}
          className={item.id === value ? "dg-tab dg-tab--active" : "dg-tab"}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
