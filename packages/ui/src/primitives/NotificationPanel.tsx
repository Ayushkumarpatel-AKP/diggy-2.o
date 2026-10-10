/**
 * Notification list: rows grouped by recency with kind icons, relative times
 * and unread dots. Presentational only — the host owns the `useNotifications`
 * state and passes items plus mark-read handlers in.
 *
 * // INTERFACE FOR INTEGRATION
 * interface NotificationPanelProps { items: readonly AppNotification[];
 *   onMarkRead?(id: string): void; onMarkAllRead?(): void }
 * function NotificationPanel(props: NotificationPanelProps): JSX.Element;
 * // END INTERFACE FOR INTEGRATION
 */
import { Fragment } from "react";

import { Icon, type IconName } from "../Icon.js";
import type { Tone } from "../theme.js";
import { formatRelative } from "../app/format.js";
import type { AppNotification, NotificationKind } from "../hooks/useNotifications.js";
import { Button } from "./Button.js";
import { Panel } from "./Card.js";

export interface NotificationPanelProps {
  items: readonly AppNotification[];
  onMarkRead?: (id: string) => void;
  onMarkAllRead?: () => void;
}

const KIND_META: Record<NotificationKind, { icon: IconName; tone: Tone; label: string }> = {
  reminder: { icon: "clock", tone: "blue", label: "Reminder" },
  alert: { icon: "bell", tone: "warning", label: "Alert" },
  approval: { icon: "shieldWarn", tone: "violet", label: "Approval" },
  integration: { icon: "integrations", tone: "mint", label: "Integration" },
  error: { icon: "alert", tone: "danger", label: "Error" },
};

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

type RecencyGroup = "Recent" | "Earlier today" | "Older";

function groupFor(at: number, now: number): RecencyGroup {
  const age = now - at;
  if (age < HOUR_MS) return "Recent";
  if (age < DAY_MS) return "Earlier today";
  return "Older";
}

const GROUP_ORDER: readonly RecencyGroup[] = ["Recent", "Earlier today", "Older"];

export function NotificationPanel({ items, onMarkRead, onMarkAllRead }: NotificationPanelProps) {
  const now = Date.now();
  const unread = items.filter((item) => !item.read).length;

  if (items.length === 0) {
    return (
      <Panel title="Notifications">
        <div className="dg-empty">
          <div className="dg-state__title">No notifications yet</div>
          <div className="dg-state__msg">
            Reminders, monitor alerts, approvals and integration updates will appear here.
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      title="Notifications"
      action={
        unread > 0 && onMarkAllRead ? (
          <Button variant="ghost" size="sm" onClick={onMarkAllRead}>
            Mark all read
          </Button>
        ) : undefined
      }
    >
      {GROUP_ORDER.map((group) => {
        const rows = items.filter((item) => groupFor(item.at, now) === group);
        if (rows.length === 0) return null;
        return (
          <Fragment key={group}>
            <div className="dg-palette__group">{group}</div>
            {rows.map((item) => {
              const meta = KIND_META[item.kind];
              return (
                <div key={item.id} className="dg-row">
                  <span className={`dg-row__lead dg-tone-${meta.tone}`}>
                    <Icon name={meta.icon} size={17} />
                  </span>
                  <div className="dg-row__body">
                    <div className="dg-row__title">
                      <span>{item.title}</span>
                      {item.read ? null : (
                        <span
                          className="dg-pill__dot"
                          role="img"
                          aria-label="Unread"
                          title="Unread"
                          style={{ background: "var(--dg-primary)", flexShrink: 0 }}
                        />
                      )}
                    </div>
                    {item.detail ? <div className="dg-row__sub">{item.detail}</div> : null}
                    <div className="dg-row__sub">
                      {meta.label} · {formatRelative(item.at, now)}
                    </div>
                  </div>
                  <div className="dg-row__trail">
                    {!item.read && onMarkRead ? (
                      <Button variant="ghost" size="sm" onClick={() => onMarkRead(item.id)}>
                        Mark read
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </Fragment>
        );
      })}
    </Panel>
  );
}
