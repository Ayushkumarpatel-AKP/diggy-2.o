/**
 * Actions — what DIGGY did, filtered by status.
 *
 * // INTERFACE FOR INTEGRATION
 * interface ActionsScreenProps { onCommand(label: string, intent?: string): void;
 *   state?: ScreenState; preview?: boolean; actions?: ActionLogRow[] }
 * // Intents emitted: `ask` (`New Action`, per-row Retry / Run now / Repeat /
 * // Details — the goal text names the row, because the runtime has no
 * // dedicated action verb).
 * // END INTERFACE FOR INTEGRATION
 */
import { useState } from "react";

import { Icon } from "../../Icon.js";
import { Button } from "../../primitives/Button.js";
import { Panel } from "../../primitives/Card.js";
import { ListRow } from "../../primitives/ListRow.js";
import { Menu } from "../../primitives/Menu.js";
import { Pill } from "../../primitives/Pill.js";
import { Tabs } from "../../primitives/Tabs.js";
import { formatClock } from "../format.js";
import { ScreenHeader } from "../ScreenHeader.js";
import { StateBlock, PreviewBadge, type ScreenState } from "../ScreenState.js";
import { type ActionLogRow, type ActionStatus } from "../sampleData.js";
import { actionMenuItems } from "./screenHelpers.js";

export interface ActionsScreenProps {
  onCommand: (label: string, intent?: string) => void;
  state?: ScreenState;
  preview?: boolean;
  /** Live action log from the host; absent keeps the honest empty state. */
  actions?: ActionLogRow[];
}

export interface ActionsScreenProps {
  onCommand: (label: string, intent?: string) => void;
  state?: ScreenState;
  preview?: boolean;
}

const ACTION_TABS = [
  { id: "all", label: "All" },
  { id: "completed", label: "Completed" },
  { id: "scheduled", label: "Scheduled" },
  { id: "failed", label: "Failed" },
];

const STATUS_TONE: Record<ActionStatus, "success" | "warning" | "danger"> = {
  completed: "success",
  scheduled: "warning",
  failed: "danger",
};

const STATUS_LABEL: Record<ActionStatus, string> = {
  completed: "Completed",
  scheduled: "Scheduled",
  failed: "Failed",
};

export function ActionsScreen({
  onCommand,
  state = "ready",
  preview = true,
  actions = [],
}: ActionsScreenProps) {
  const [tab, setTab] = useState("all");
  const rows = tab === "all" ? actions : actions.filter((row) => row.status === tab);

  return (
    <>
      <ScreenHeader
        icon="actions"
        tone="mint"
        title="Actions"
        subtitle="See what DIGGY has done for you."
      >
        {preview ? <PreviewBadge /> : null}
        <Button variant="primary" icon="plus" onClick={() => onCommand("New Action", "ask")}>
          New Action
        </Button>
      </ScreenHeader>

      <Tabs items={ACTION_TABS} value={tab} onChange={setTab} ariaLabel="Action status" />

      <Panel>
        {state !== "ready" ? (
          <StateBlock
            state={state}
            icon="actions"
            title={
              state === "loading"
                ? "Loading your actions…"
                : state === "empty"
                  ? "No actions yet"
                  : "Couldn’t load your actions"
            }
            message={
              state === "empty"
                ? "Things DIGGY has done for you — filled forms, summaries, reminders — show up here. Ask below to create your first one."
                : state === "error"
                  ? "The action log didn’t respond. Try again."
                  : undefined
            }
            onRetry={() => onCommand("Retry actions")}
          />
        ) : rows.length === 0 ? (
          <div className="dg-empty">
            <Icon name="actions" size={22} />
            <p style={{ margin: "8px 0 0" }}>
              Things DIGGY has done for you — filled forms, summaries, reminders — show up
              here. Nothing in this state yet; try another tab.
            </p>
          </div>
        ) : (
          rows.map((row) => (
            <ListRow
              key={row.id}
              icon={row.icon}
              tone={row.tone}
              title={row.title}
              subtitle={row.subtitle}
              trail={
                <>
                  <Pill tone={STATUS_TONE[row.status]} dot>
                    {STATUS_LABEL[row.status]}
                  </Pill>
                  <span className="dg-row__time">{formatClock(row.at)}</span>
                  <Menu
                    label={`Options for ${row.title}`}
                    align="right"
                    items={actionMenuItems(row.status, row.title).map((item) => ({
                      id: item.id,
                      label: item.label,
                      onSelect: () => onCommand(item.text, "ask"),
                    }))}
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
