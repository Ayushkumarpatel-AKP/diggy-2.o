/**
 * Real screen states — loading / empty / error — plus the preview badge that labels sample data.
 *
 * Every screen renders one of these instead of pretending sample rows are live data.
 *
 * // INTERFACE FOR INTEGRATION
 * type ScreenState = "ready" | "loading" | "empty" | "error";
 * interface StateBlockProps { state: Exclude<ScreenState, "ready">; title: string; message?: string;
 *   icon?: IconName; tone?: Tone; onRetry?: () => void }
 * function StateBlock(props: StateBlockProps): JSX.Element;
 * function PreviewBadge(props: { note?: string }): JSX.Element;
 * // END INTERFACE FOR INTEGRATION
 */
import { Icon, type IconName } from "../Icon.js";
import { Button } from "../primitives/Button.js";
import { Pill } from "../primitives/Pill.js";
import type { Tone } from "../theme.js";

export type ScreenState = "ready" | "loading" | "empty" | "error";

export interface StateBlockProps {
  state: Exclude<ScreenState, "ready">;
  title: string;
  message?: string;
  icon?: IconName;
  tone?: Tone;
  onRetry?: () => void;
}

/** One block for every non-ready screen state, so no screen is ever blank or fake. */
export function StateBlock({ state, title, message, icon, tone, onRetry }: StateBlockProps) {
  if (state === "loading") {
    return (
      <div className="dg-state dg-state--loading" role="status" aria-live="polite">
        <span className="dg-spinner" aria-hidden="true" />
        <p className="dg-state__title">{title}</p>
        {message ? <p className="dg-state__msg">{message}</p> : null}
        <div className="dg-state__skeleton" aria-hidden="true">
          <span className="dg-skeleton-line" />
          <span className="dg-skeleton-line" />
          <span className="dg-skeleton-line" />
        </div>
      </div>
    );
  }

  const isError = state === "error";
  const resolvedIcon: IconName = icon ?? (isError ? "alert" : "sparkle");
  const resolvedTone: Tone = tone ?? (isError ? "danger" : "muted");

  return (
    <div className={`dg-state dg-state--${state}`} role={isError ? "alert" : "status"}>
      <span className={`dg-state__icon dg-tone-${resolvedTone}`}>
        <Icon name={resolvedIcon} size={20} />
      </span>
      <p className="dg-state__title">{title}</p>
      {message ? <p className="dg-state__msg">{message}</p> : null}
      {isError && onRetry ? (
        <Button variant="outline" size="sm" icon="refresh" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export interface PreviewBadgeProps {
  note?: string;
}

/** Marks rows that come from sample data rather than a live engine. */
export function PreviewBadge({
  note = "Sample data — connect DIGGY to see live results.",
}: PreviewBadgeProps) {
  return (
    <Pill tone="muted" icon="eye" className="dg-preview" title={note}>
      Preview data
    </Pill>
  );
}
