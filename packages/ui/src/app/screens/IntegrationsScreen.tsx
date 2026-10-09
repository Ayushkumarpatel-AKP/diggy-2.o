/**
 * Integrations — connectable tools grouped by category.
 *
 * Rows come from the `integrations` prop (supplied by the extension's
 * connector layer). The screen never performs OAuth itself: Connect and
 * Disconnect only emit `onCommand` intents (`integration.connect:<id>` /
 * `integration.disconnect:<id>`) and the background connector does the work.
 * Tokens are never rendered, logged or returned here.
 *
 * // INTERFACE FOR INTEGRATION
 * interface IntegrationsScreenProps { onCommand(label: string, intent?: string): void;
 *   state?: ScreenState; preview?: boolean; integrations?: IntegrationRow[] }
 * // END INTERFACE FOR INTEGRATION
 */
import { useState } from "react";

import { Icon } from "../../Icon.js";
import { BrandMark } from "../../logos/BrandMark.js";
import { Panel } from "../../primitives/Card.js";
import { Pill } from "../../primitives/Pill.js";
import { Tabs } from "../../primitives/Tabs.js";
import { ScreenHeader } from "../ScreenHeader.js";
import { StateBlock, PreviewBadge, type ScreenState } from "../ScreenState.js";
import { sampleIntegrations, type IntegrationRow } from "../sampleData.js";

export interface IntegrationsScreenProps {
  onCommand: (label: string, intent?: string) => void;
  state?: ScreenState;
  preview?: boolean;
  /** Live catalog from the connector layer; absent keeps the legacy empty state. */
  integrations?: IntegrationRow[];
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
  integrations,
}: IntegrationsScreenProps) {
  const [tab, setTab] = useState("all");
  const catalog = integrations ?? sampleIntegrations;
  const rows =
    tab === "all"
      ? catalog
      : catalog.filter((item) => item.category.toLowerCase() === tab);
  const connectedCount = catalog.filter((item) => item.status === "connected").length;

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

      {integrations !== undefined ? (
        <div className="dg-inline">
          <Pill
            tone={connectedCount > 0 ? "success" : "muted"}
            icon={connectedCount > 0 ? "check" : "integrations"}
          >
            {connectedCount} of {catalog.length} connected
          </Pill>
        </div>
      ) : null}

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
            title={
              integrations !== undefined && connectedCount === 0 && catalog.length === 0
                ? "Nothing connected yet"
                : "Nothing in this category"
            }
            message={
              integrations !== undefined && catalog.length === 0
                ? "Pick a tool below to connect it, or check back after the background connector loads the catalog."
                : "Try another category, or add a new integration."
            }
          />
        </Panel>
      ) : (
        <>
          {integrations !== undefined && connectedCount === 0 ? (
            <div className="dg-inline">
              <Pill tone="muted" icon="integrations">
                Nothing connected yet — pick a tool below to get started.
              </Pill>
            </div>
          ) : null}
          <div className="dg-grid dg-grid--3">
            {rows.map((item) => (
              <div key={item.id} className="dg-intg">
                <BrandMark spec={{ id: item.id, label: item.name, color: item.color, mark: item.mark }} />
                <div className="dg-intg__body">
                  <div className="dg-intg__name">{item.name}</div>
                  <div className="dg-intg__cat">{item.category}</div>
                  {item.status === "attention" && item.detail ? (
                    <div className="dg-intg__cat" title={item.detail}>
                      {item.detail}
                    </div>
                  ) : null}
                </div>
                <div
                  style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}
                >
                  {item.status === "connected" ? (
                    <>
                      <Pill tone="success" icon="check">
                        Connected
                      </Pill>
                      <button
                        type="button"
                        className="dg-btn dg-btn--outline dg-btn--sm"
                        onClick={() =>
                          onCommand(`${item.name} disconnect`, `integration.disconnect:${item.id}`)
                        }
                      >
                        Disconnect
                      </button>
                    </>
                  ) : item.status === "connecting" ? (
                    <Pill tone="blue">Connecting…</Pill>
                  ) : item.status === "attention" ? (
                    <>
                      <Pill tone="warning" icon="alert" title={item.detail ?? "Needs attention"}>
                        Needs attention
                      </Pill>
                      <button
                        type="button"
                        className="dg-btn dg-btn--outline dg-btn--sm"
                        onClick={() =>
                          onCommand(`${item.name} connect`, `integration.connect:${item.id}`)
                        }
                      >
                        Retry
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="dg-btn dg-btn--outline dg-btn--sm"
                      onClick={() =>
                        onCommand(`${item.name} connect`, `integration.connect:${item.id}`)
                      }
                    >
                      Connect
                    </button>
                  )}
                </div>
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
        </>
      )}

      <div className="dg-inline">
        <Pill tone="muted" icon="shieldWarn">
          Host access is requested per site — never bundled as a required permission.
        </Pill>
      </div>
    </>
  );
}
