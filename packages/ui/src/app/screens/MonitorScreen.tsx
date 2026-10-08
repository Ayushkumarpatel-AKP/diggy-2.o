/**
 * Monitor — watch list with engine tabs, per-watch tags and status.
 *
 * // INTERFACE FOR INTEGRATION
 * interface MonitorScreenProps { onCommand(label: string, intent?: string): void }
 * // END INTERFACE FOR INTEGRATION
 */
import { useState } from "react";

import { Icon } from "../../Icon.js";
import { Button } from "../../primitives/Button.js";
import { Panel } from "../../primitives/Card.js";
import { IconButton } from "../../primitives/IconButton.js";
import { ListRow } from "../../primitives/ListRow.js";
import { Pill } from "../../primitives/Pill.js";
import { Tabs } from "../../primitives/Tabs.js";
import { ScreenHeader } from "../ScreenHeader.js";
import { sampleWatches } from "../sampleData.js";

export interface MonitorScreenProps {
  onCommand: (label: string, intent?: string) => void;
}

const MONITOR_TABS = [
  { id: "websites", label: "Websites" },
  { id: "github", label: "GitHub" },
  { id: "others", label: "Others" },
];

function hostname(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function MonitorScreen({ onCommand }: MonitorScreenProps) {
  const [tab, setTab] = useState("websites");
  const rows = tab === "websites" ? sampleWatches : [];

  return (
    <>
      <ScreenHeader
        icon="monitor"
        tone="blue"
        title="Monitor"
        subtitle="Track websites, get notified when something important changes."
      >
        <Button variant="primary" icon="plus" onClick={() => onCommand("Add Website")}>
          Add Website
        </Button>
      </ScreenHeader>

      <Tabs items={MONITOR_TABS} value={tab} onChange={setTab} ariaLabel="Monitor sources" />

      <Panel>
        {rows.length === 0 ? (
          <div className="dg-empty">
            <Icon name="globe" size={22} />
            <p style={{ margin: "8px 0 0" }}>Nothing tracked here yet.</p>
          </div>
        ) : (
          rows.map((watch) => (
            <ListRow
              key={watch.spec.id}
              lead={
                <span
                  className="dg-row__lead"
                  style={{ background: "var(--dg-primary-soft)", color: "#b58200", fontWeight: 700 }}
                >
                  <Icon name="globe" size={17} />
                </span>
              }
              title={watch.name}
              subtitle={hostname(watch.spec.url)}
              tags={watch.tags.map((tag) => (
                <Pill key={tag} outline>
                  {tag}
                </Pill>
              ))}
              trail={
                <>
                  {watch.active ? (
                    <Pill tone="success" dot>
                      Active
                    </Pill>
                  ) : (
                    <Pill tone="muted">Paused</Pill>
                  )}
                  <IconButton
                    icon="bell"
                    label={`Notifications for ${watch.name}`}
                    onClick={() => onCommand(`Notifications for ${watch.name}`)}
                  />
                  <IconButton
                    icon="more"
                    label={`More options for ${watch.name}`}
                    onClick={() => onCommand(`Options for ${watch.name}`)}
                  />
                </>
              }
            />
          ))
        )}
      </Panel>
    </>
  );
}
