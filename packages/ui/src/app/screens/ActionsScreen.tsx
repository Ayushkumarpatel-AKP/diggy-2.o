/**
 * Actions — what DIGGY did, filtered by status.
 *
 * // INTERFACE FOR INTEGRATION
 * interface ActionsScreenProps { onCommand(label: string, intent?: string): void;
 *   state?: ScreenState; preview?: boolean }
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
import { formatClock } from "../format.js";
import { ScreenHeader } from "../ScreenHeader.js";
import { StateBlock, PreviewBadge, type ScreenState } from "../ScreenState.js";
import { sampleActionLog, type ActionStatus } from "../sampleData.js";

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
}: ActionsScreenProps) {
  const [tab, setTab] = useState("all");
  const rows =
    tab === "all" ? sampleActionLog : sampleActionLog.filter((row) => row.status === tab);

  return (
    <>
      <ScreenHeader
        icon="actions"
        tone="mint"
        title="Actions"
        subtitle="See what DIGGY has done for you."
      >
        {preview ? <PreviewBadge /> : null}
        <Button variant="primary" icon="plus" onClick={() => onCommand("New Action")}>
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
                ? "Ask DIGGY to fill a form, summarise a page or set a reminder."
                : state === "error"
                  ? "The action log didn’t respond. Try again."
                  : undefined
            }
            onRetry={() => onCommand("Retry actions")}
          />
        ) : rows.length === 0 ? (
          <div className="dg-empty">
            <Icon name="actions" size={22} />
            <p style={{ margin: "8px 0 0" }}>No actions in this state.</p>
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
                  <IconButton
                    icon="more"
                    label={`Options for ${row.title}`}
                    onClick={() => onCommand(`Options for ${row.title}`)}
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
