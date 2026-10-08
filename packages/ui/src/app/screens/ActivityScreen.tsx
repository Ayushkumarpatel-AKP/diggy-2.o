/**
 * Activity — transparency timeline of everything DIGGY did.
 *
 * // INTERFACE FOR INTEGRATION
 * interface ActivityScreenProps { onCommand(label: string, intent?: string): void }
 * // END INTERFACE FOR INTEGRATION
 */
import { Icon } from "../../Icon.js";
import { Panel } from "../../primitives/Card.js";
import { formatClock } from "../format.js";
import { ScreenHeader } from "../ScreenHeader.js";
import { ACTIVITY_ICON, ACTIVITY_TONE, sampleActivity } from "../sampleData.js";

export interface ActivityScreenProps {
  onCommand: (label: string, intent?: string) => void;
}

export function ActivityScreen({ onCommand }: ActivityScreenProps) {
  return (
    <>
      <ScreenHeader
        icon="activity"
        tone="blue"
        title="Activity"
        subtitle="A record of everything DIGGY does."
      >
        <button type="button" className="dg-select" onClick={() => onCommand("Activity range")}>
          Today <Icon name="chevronDown" size={14} />
        </button>
      </ScreenHeader>

      <Panel>
        <div className="dg-timeline">
          {sampleActivity.map((event) => (
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
      </Panel>
    </>
  );
}
