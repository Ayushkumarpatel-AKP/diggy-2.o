/**
 * Integrations — connectable tools grouped by category.
 *
 * // INTERFACE FOR INTEGRATION
 * interface IntegrationsScreenProps { onCommand(label: string, intent?: string): void;
 *   state?: ScreenState; preview?: boolean }
 * // END INTERFACE FOR INTEGRATION
 */
import { useState } from "react";

import { Icon } from "../../Icon.js";
import { Panel } from "../../primitives/Card.js";
import { Pill } from "../../primitives/Pill.js";
import { Tabs } from "../../primitives/Tabs.js";
import { ScreenHeader } from "../ScreenHeader.js";
import { StateBlock, PreviewBadge, type ScreenState } from "../ScreenState.js";
import { sampleIntegrations } from "../sampleData.js";

export interface IntegrationsScreenProps {
  onCommand: (label: string, intent?: string) => void;
  state?: ScreenState;
  preview?: boolean;
}

const INTEGRATION_TABS = [
  { id: "all", label: "All" },
  { id: "productivity", label: "Productivity" },
  { id: "development", label: "Development" },
  { id: "social", label: "Social" },
];

export function IntegrationsScreen({
  onCommand,
  state = "ready",
  preview = true,
}: IntegrationsScreenProps) {
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
      >
        {preview ? <PreviewBadge /> : null}
      </ScreenHeader>

      <Tabs
        items={INTEGRATION_TABS}
        value={tab}
        onChange={setTab}
        ariaLabel="Integration categories"
      />

      {state !== "ready" ? (
        <Panel>
          <StateBlock
            state={state}
            icon="integrations"
            title={
              state === "loading"
                ? "Loading integrations…"
                : state === "empty"
                  ? "No integrations yet"
                  : "Couldn’t load integrations"
            }
            message={
              state === "empty"
                ? "Connect a tool to let DIGGY work with it."
                : state === "error"
                  ? "The integrations catalog didn’t respond. Try again."
                  : undefined
            }
            onRetry={() => onCommand("Retry integrations")}
          />
        </Panel>
      ) : rows.length === 0 ? (
        <Panel>
          <StateBlock
            state="empty"
            icon="integrations"
            title="Nothing in this category"
            message="Try another category, or add a new integration."
          />
        </Panel>
      ) : (
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
                className={
                  item.status === "connected"
                    ? "dg-pill dg-tone-success dg-pillbtn"
                    : "dg-btn dg-btn--outline dg-btn--sm"
                }
                onClick={() =>
                  onCommand(`${item.status === "connected" ? "Manage" : "Connect"} ${item.name}`)
                }
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
          <button
            type="button"
            className="dg-intg dg-intg--add"
            onClick={() => onCommand("Add More integrations")}
          >
            <Icon name="plus" size={16} /> Add More
          </button>
        </div>
      )}

      <div className="dg-inline">
        <Pill tone="muted" icon="shieldWarn">
          Host access is requested per site — never bundled as a required permission.
        </Pill>
      </div>
    </>
  );
}
