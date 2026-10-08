/**
 * Sidepanel Activity panel — the live Activity Center timeline.
 *
 * Owned by the activity worker (`agents/activity.md`). Consumes the `@diggy/ui`
 * design system (never reimplements it) and reads from the `@diggy/activity`
 * log — either a controlled `events` array (demo/tests) or a live
 * `ActivityAPI` (`list()` once, then `onRecord()` for streaming updates).
 *
 * // INTERFACE FOR INTEGRATION
 * interface ActivityPanelProps {
 *   events?: ActivityEvent[];                        // controlled mode
 *   log?: ActivityAPI;                                // live mode (list + onRecord)
 *   onCommand?: (label: string, intent?: string) => void;
 * }
 * function ActivityPanel(props: ActivityPanelProps): JSX.Element;
 * type ActivityRange = "today" | "all" | string;      // string = "YYYY-MM-DD"
 * function toDayKey(at: number): string;             // "YYYY-MM-DD" (local)
 * function filterActivityByDay(events: ActivityEvent[], day: string | null): ActivityEvent[];
 * // END INTERFACE FOR INTEGRATION
 */
import { useEffect, useMemo, useState } from "react";
import type { ActivityAPI, ActivityEvent } from "@diggy/shared";
import { ACTIVITY_ICON, ACTIVITY_TONE, formatClock, Icon, Panel, ScreenHeader } from "@diggy/ui";

export interface ActivityPanelProps {
  /** Controlled mode: render exactly these events (demo/tests). */
  events?: ActivityEvent[];
  /** Live mode: initial `list()` plus an `onRecord()` subscription. */
  log?: ActivityAPI;
  onCommand?: (label: string, intent?: string) => void;
}

/** Local `YYYY-MM-DD` key for an epoch timestamp. */
export function toDayKey(at: number): string {
  const date = new Date(at);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Keeps every event when `day` is `null`, otherwise only that calendar day. */
export function filterActivityByDay(events: ActivityEvent[], day: string | null): ActivityEvent[] {
  if (day === null) return [...events];
  return events.filter((event) => toDayKey(event.at) === day);
}

function newestFirst(events: ActivityEvent[]): ActivityEvent[] {
  return [...events].sort((a, b) => b.at - a.at);
}

export function ActivityPanel({ events: controlled, log, onCommand }: ActivityPanelProps) {
  const [live, setLive] = useState<ActivityEvent[]>(controlled ?? []);
  const [range, setRange] = useState<string>("today");

  useEffect(() => {
    if (controlled !== undefined) {
      setLive(controlled);
      return;
    }
    if (!log) return;
    let cancelled = false;
    void log.list().then((initial) => {
      if (!cancelled) setLive(initial);
    });
    const unsubscribe = log.onRecord((event) => {
      setLive((previous) => newestFirst([event, ...previous]));
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [controlled, log]);

  const visible = useMemo(() => {
    const day = range === "all" ? null : range === "today" ? toDayKey(Date.now()) : range;
    return newestFirst(filterActivityByDay(live, day));
  }, [live, range]);

  const notify = onCommand ?? ((): void => undefined);

  return (
    <>
      <ScreenHeader
        icon="activity"
        tone="blue"
        title="Activity"
        subtitle="A record of everything DIGGY does."
      >
        <label className="dg-select" aria-label="Activity range">
          <select
            aria-label="Activity range"
            value={range}
            onChange={(event) => setRange(event.target.value)}
            className="dg-select__input"
          >
            <option value="today">Today</option>
            <option value="all">All time</option>
          </select>
          <Icon name="chevronDown" size={14} />
        </label>
        <input
          type="date"
          aria-label="Filter by date"
          value={range === "today" || range === "all" ? "" : range}
          max={toDayKey(Date.now())}
          onChange={(event) => setRange(event.target.value === "" ? "all" : event.target.value)}
        />
      </ScreenHeader>

      <Panel>
        {visible.length === 0 ? (
          <div className="dg-empty">
            <Icon name="activity" size={22} />
            <p style={{ margin: "8px 0 0" }}>No activity in this range yet.</p>
            <button type="button" className="dg-select" onClick={() => notify("Activity range")}>
              View all activity
            </button>
          </div>
        ) : (
          <div className="dg-timeline">
            {visible.map((event) => (
              <div key={event.id} className="dg-tl">
                <div className="dg-tl__time">{formatClock(event.at)}</div>
                <div className="dg-tl__rail">
                  <span className="dg-tl__node" />
                </div>
                <div className="dg-tl__body">
                  <div className="dg-inline" style={{ gap: 9 }}>
                    <span
                      className={`dg-quick__icon dg-tone-${ACTIVITY_TONE[event.kind]}`}
                      aria-hidden="true"
                    >
                      <Icon name={ACTIVITY_ICON[event.kind]} size={15} />
                    </span>
                    <div>
                      <div className="dg-tl__title">{event.title}</div>
                      {event.detail ? <div className="dg-tl__sub">{event.detail}</div> : null}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}
