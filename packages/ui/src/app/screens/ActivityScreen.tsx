/**
 * Activity — transparency timeline of everything DIGGY did.
 *
 * // INTERFACE FOR INTEGRATION
 * interface ActivityScreenProps { onCommand(label: string, intent?: string): void;
 *   state?: ScreenState; preview?: boolean; events?: ActivityEvent[] }
 * // The range selector is a real `Menu` that filters the timeline locally —
 * // no runtime intent, nothing leaves the panel.
 * // END INTERFACE FOR INTEGRATION
 */
import { useState } from "react";
import type { ActivityEvent } from "@diggy/shared";

import { Icon } from "../../Icon.js";
import { Panel } from "../../primitives/Card.js";
import { Menu } from "../../primitives/Menu.js";
import { formatClock } from "../format.js";
import { ScreenHeader } from "../ScreenHeader.js";
import { StateBlock, PreviewBadge, type ScreenState } from "../ScreenState.js";
import { ACTIVITY_ICON, ACTIVITY_TONE, sampleActivity } from "../sampleData.js";
import { ACTIVITY_RANGES, filterEventsByRange } from "./screenHelpers.js";

export interface ActivityScreenProps {
  onCommand: (label: string, intent?: string) => void;
  state?: ScreenState;
  preview?: boolean;
  events?: ActivityEvent[];
}

export function ActivityScreen({
  onCommand,
  state = "ready",
  preview = true,
  events = sampleActivity,
}: ActivityScreenProps) {
  const [range, setRange] = useState<string>("today");
  const visible = filterEventsByRange(events, range);
  const rangeLabel =
    ACTIVITY_RANGES.find((entry) => entry.id === range)?.label ?? "Today";
  return (
    <>
      <ScreenHeader
        icon="activity"
        tone="blue"
        title="Activity"
        subtitle="A record of everything DIGGY does."
      >
        {preview ? <PreviewBadge /> : null}
        <Menu
          label={`Activity range: ${rangeLabel}`}
          align="right"
          items={ACTIVITY_RANGES.map((entry) => ({
            id: entry.id,
            label: entry.label,
            onSelect: () => setRange(entry.id),
          }))}
        />
      </ScreenHeader>

      <Panel>
        {state !== "ready" ? (
          <StateBlock
            state={state}
            icon="activity"
            title={
              state === "loading"
                ? "Loading your activity…"
                : state === "empty"
                  ? "No activity yet"
                  : "Couldn’t load activity"
            }
            message={
              state === "empty"
                ? "Once DIGGY reads, summarizes or acts, it shows up here."
                : state === "error"
                  ? "The activity log didn’t respond. Try again."
                  : undefined
            }
            onRetry={() => onCommand("Retry activity")}
          />
        ) : events.length === 0 ? (
          <StateBlock state="empty" icon="activity" title="No activity yet" />
        ) : visible.length === 0 ? (
          <StateBlock
            state="empty"
            icon="activity"
            title={`Nothing in ${rangeLabel.toLowerCase()}`}
            message="DIGGY hasn't done anything in this range yet — widen the range above."
          />
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
