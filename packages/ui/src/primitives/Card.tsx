/**
 * // INTERFACE FOR INTEGRATION
 * interface CardProps { padded?: boolean; interactive?: boolean; className?: string;
 *   children?: ReactNode; onClick?: () => void }
 * interface PanelProps { title?: ReactNode; action?: ReactNode; className?: string;
 *   children?: ReactNode }
 * // END INTERFACE FOR INTEGRATION
 */
import type { ReactNode } from "react";

export interface CardProps {
  padded?: boolean;
  interactive?: boolean;
  className?: string;
  children?: ReactNode;
  onClick?: () => void;
}

export function Card({ padded, interactive, className, children, onClick }: CardProps) {
  const classes = [
    "dg-card",
    padded ? "dg-card--pad" : "",
    interactive ? "dg-card--interactive" : "",
    className ?? "",
  ]
    .join(" ")
    .trim();
  return (
    <div className={classes} onClick={onClick}>
      {children}
    </div>
  );
}

export interface PanelProps {
  title?: ReactNode;
  action?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export function Panel({ title, action, className, children }: PanelProps) {
  return (
    <section className={["dg-panel", className ?? ""].join(" ").trim()}>
      {title || action ? (
        <div className="dg-panel__head">
          {title ? <h2 className="dg-panel__title">{title}</h2> : null}
          {action ? <div className="dg-panel__action">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
