/**
 * Home — greeting hero, metric tiles, recent alerts, quick commands.
 *
 * // INTERFACE FOR INTEGRATION
 * interface HomeScreenProps { onNavigate(id: NavTabId): void; onOpenPalette(): void;
 *   onCommand(label: string, intent?: string): void }
 * // END INTERFACE FOR INTEGRATION
 */
import type { NavTabId } from "@diggy/shared";

import { DiggyLogo } from "../../DiggyLogo.js";
import { Icon } from "../../Icon.js";
import { AlertRow } from "../../primitives/AlertRow.js";
import { MetricTile } from "../../primitives/MetricTile.js";
import { Panel } from "../../primitives/Card.js";
import { QuickAction } from "../../primitives/QuickAction.js";
import { SearchField } from "../../primitives/Input.js";
import { formatRelative } from "../format.js";
import { sampleAlerts, sampleMetrics, sampleQuickCommands, sampleUser } from "../sampleData.js";

export interface HomeScreenProps {
  onNavigate: (id: NavTabId) => void;
  onOpenPalette: () => void;
  onCommand: (label: string, intent?: string) => void;
}

export function HomeScreen({ onNavigate, onOpenPalette, onCommand }: HomeScreenProps) {
  return (
    <>
      <SearchField onActivate={onOpenPalette} readOnly hint="⌘K" />

      <section className="dg-hero">
        <div className="dg-hero__text">
          <h1 className="dg-greeting">
            {sampleUser.greeting} <span aria-hidden="true">👋</span>
          </h1>
          <p className="dg-hero__subtitle">{sampleUser.subtitle}</p>
        </div>
        <div className="dg-hero__stage">
          <div
            className="dg-bubble dg-bubble--speech"
            style={{ maxWidth: 190 }}
            role="status"
          >
            <span className="dg-bubble__priority dg-dot--ok" aria-hidden="true" />
            Let&apos;s make today productive!
          </div>
          <div className="dg-hero__avatar">
            {/* TEMP STUB — the FBX avatar renderer (packages/avatar) mounts here. */}
            <DiggyLogo size={64} />
          </div>
        </div>
      </section>

      <div className="dg-tiles">
        {sampleMetrics.map((metric) => (
          <MetricTile
            key={metric.id}
            icon={metric.icon}
            tone={metric.tone}
            value={metric.value}
            label={metric.label}
            sub={metric.sub}
            onClick={() => onCommand(metric.label)}
          />
        ))}
      </div>

      <div className="dg-split">
        <Panel
          title="Recent Alerts"
          action={
            <button type="button" className="dg-linkbtn" onClick={() => onNavigate("monitor")}>
              View All
            </button>
          }
        >
          {sampleAlerts.map((alert) => (
            <AlertRow
              key={alert.id}
              icon={alert.icon}
              tone={alert.tone}
              title={alert.title}
              subtitle={alert.subtitle}
              time={formatRelative(alert.at)}
              severity={alert.severity}
              onClick={() => onCommand(`${alert.title} alert`)}
            />
          ))}
        </Panel>

        <Panel title="Quick Commands">
          <div className="dg-quickgrid">
            {sampleQuickCommands.map((command) => (
              <QuickAction
                key={command.id}
                icon={command.icon}
                tone={command.tone}
                label={command.label}
                onClick={() => onCommand(command.label, command.intent)}
              />
            ))}
          </div>
          <button
            type="button"
            className="dg-linkbtn"
            style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 6 }}
            onClick={onOpenPalette}
          >
            <Icon name="sparkle" size={14} /> Open command palette
          </button>
        </Panel>
      </div>
    </>
  );
}
