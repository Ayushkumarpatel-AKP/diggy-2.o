/**
 * Integrations — connectable tools grouped by category.
 *
 * // INTERFACE FOR INTEGRATION
 * interface IntegrationsScreenProps { onCommand(label: string, intent?: string): void }
 * // END INTERFACE FOR INTEGRATION
 */
import { useState } from "react";

import { Icon } from "../../Icon.js";
import { Pill } from "../../primitives/Pill.js";
import { Tabs } from "../../primitives/Tabs.js";
import { ScreenHeader } from "../ScreenHeader.js";
import { sampleIntegrations } from "../sampleData.js";

export interface IntegrationsScreenProps {
  onCommand: (label: string, intent?: string) => void;
}

const INTEGRATION_TABS = [
  { id: "all", label: "All" },
  { id: "productivity", label: "Productivity" },
  { id: "development", label: "Development" },
  { id: "social", label: "Social" },
];

export function IntegrationsScreen({ onCommand }: IntegrationsScreenProps) {
  const [tab, setTab] = useState("all");
  const rows =
    tab === "all"
      ? sampleIntegrations
      : sampleIntegrations.filter((item) => item.category.toLowerCase() === tab);

  return (
    <>
      <ScreenHeader
        icon="integrations"
        tone="violet"
        title="Integrations"
        subtitle="Connect your tools to make DIGGY more powerful."
      />

      <Tabs items={INTEGRATION_TABS} value={tab} onChange={setTab} ariaLabel="Integration categories" />

      <div className="dg-grid dg-grid--3">
        {rows.map((item) => (
          <div key={item.id} className="dg-intg">
            <span className="dg-intg__logo" style={{ background: item.color }}>
              {item.mark}
            </span>
            <div className="dg-intg__body">
              <div className="dg-intg__name">{item.name}</div>
              <div className="dg-intg__cat">{item.category}</div>
            </div>
            <button
              type="button"
              className={item.status === "connected" ? "dg-pill dg-tone-success" : "dg-btn dg-btn--outline dg-btn--sm"}
              onClick={() => onCommand(`${item.status === "connected" ? "Manage" : "Connect"} ${item.name}`)}
            >
              {item.status === "connected" ? (
                <>
                  <Icon name="check" size={12} /> Connected
                </>
              ) : (
                "Connect"
              )}
            </button>
          </div>
        ))}
        <button type="button" className="dg-intg dg-intg--add" onClick={() => onCommand("Add More integrations")}>
          <Icon name="plus" size={16} /> Add More
        </button>
      </div>

      <div className="dg-inline">
        <Pill tone="muted" icon="shieldWarn">
          Host access is requested per site — never bundled as a required permission.
        </Pill>
      </div>
    </>
  );
}
