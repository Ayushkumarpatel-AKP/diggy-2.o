/**
 * Side panel entrypoint — the real 7-tab DIGGY dashboard.
 *
 * The dashboard is presentational. Every button and every composer send is
 * forwarded to the extension runtime on one channel (`diggy:command`), and the
 * panel listens back for two things the runtime pushes while a command runs:
 *
 * - `diggy:progress` — one line per step, keyed by a stable id so each step
 *   replaces the previous line in the thinking bubble instead of queueing.
 * - `diggy:confirmation` — the submit offer. The runtime fills forms but never
 *   submits; this panel is where the user presses the button, and that press is
 *   what sends `intent: "confirm"`.
 */
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { Dashboard, type WatchRow } from "../../../../packages/ui/src/index.js";
import type { BubbleStyle, StatusPriority } from "../../../../packages/ui/src/index.js";
import type { ActivityEvent, WatchSpec } from "@diggy/shared";
import "../../../../packages/ui/src/styles.css";
import "../../assets/app.css";

interface LiveStatus {
  id: string;
  text: string;
  priority?: StatusPriority;
  style?: BubbleStyle;
}

interface Confirmation {
  id: string;
  title: string;
  detail?: string;
  confirmLabel?: string;
  denyLabel?: string;
}

/** The one snapshot the background broadcasts — see `broadcastState`. */
interface AppState {
  vault?: { exists: boolean; unlocked: boolean };
  watches?: { id: string; url: string; kind: string; intervalSec: number }[];
  reminders?: { id: string; title: string; dueAt: number; done: boolean }[];
  usage?: string;
  events?: ActivityEvent[];
}

/** The one channel from the panel to the runtime. */
function send(message: Record<string, unknown>): void {
  void browser.runtime.sendMessage({ type: "diggy:command", ...message }).catch(() => undefined);
}

/** The kinds the monitor actually accepts. */
const WATCH_KINDS = new Set([
  "content_change",
  "keyword",
  "new_post",
  "registration_open",
  "deadline_change",
  "release_published",
  "price_change",
  "custom",
]);

/** The background sends a plain spec; the screen wants a display row. */
function toWatchRow(spec: { id: string; url: string; kind: string; intervalSec: number }): WatchRow {
  let name = spec.url;
  try {
    name = new URL(spec.url).host.replace(/^www\./, "");
  } catch {
    /* keep the raw url when it will not parse */
  }
  return {
    spec: {
      id: spec.id,
      url: spec.url,
      kind: (WATCH_KINDS.has(spec.kind) ? spec.kind : "content_change") as WatchSpec["kind"],
      intervalSec: spec.intervalSec,
      createdAt: 0,
    },
    name,
    tags: [spec.kind.replace(/_/g, " ")],
    active: true,
  };
}

function SidePanel() {
  const [liveStatus, setLiveStatus] = useState<LiveStatus | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [state, setState] = useState<AppState>({});

  useEffect(() => {
    const onMessage = (raw: unknown): undefined => {
      const message = raw as
        | {
            type?: string;
            id?: string;
            text?: string;
            priority?: number;
            style?: string;
            confirmation?: Confirmation | null;
            state?: AppState;
          }
        | undefined;
      if (!message) return undefined;

      if (message.type === "diggy:progress" && typeof message.text === "string") {
        const next: LiveStatus = { id: message.id ?? "run", text: message.text };
        if (message.priority === 0 || message.priority === 1 || message.priority === 2 || message.priority === 3) {
          next.priority = message.priority;
        }
        if (message.style === "thought" || message.style === "speech") next.style = message.style;
        setLiveStatus(next);
      }

      if (message.type === "diggy:confirmation") {
        setConfirmation(message.confirmation ?? null);
      }

      // The shared snapshot: vault state, watches, reminders, spend.
      if (message.type === "diggy:state" && message.state) {
        setState(message.state);
      }
      return undefined;
    };

    browser.runtime.onMessage.addListener(onMessage);
    // Ask for a snapshot on open — the panel may have opened after a change.
    send({ intent: "state" });
    return () => browser.runtime.onMessage.removeListener(onMessage);
  }, []);

  return (
    <Dashboard
      onSettings={() => {
        void browser.runtime.openOptionsPage();
      }}
      onAction={(intent) => send({ intent })}
      onAsk={(text) => send({ intent: "ask", text })}
      {...(liveStatus ? { liveStatus } : {})}
      {...(state.watches ? { watches: state.watches.map(toWatchRow) } : {})}
      {...(state.events ? { events: state.events } : {})}
      vault={{
        ...(state.vault ? { status: state.vault } : {}),
        onUnlock: (passphrase) => {
          send({ intent: "vault.unlock", text: passphrase });
        },
        onLock: () => {
          send({ intent: "vault.lock" });
        },
        onCreate: (passphrase) => {
          send({ intent: "vault.create", text: passphrase });
        },
      }}
      {...(confirmation
        ? {
            pendingConfirmation: {
              id: confirmation.id,
              title: confirmation.title,
              ...(confirmation.detail !== undefined ? { detail: confirmation.detail } : {}),
              ...(confirmation.confirmLabel !== undefined
                ? { confirmLabel: confirmation.confirmLabel }
                : {}),
              ...(confirmation.denyLabel !== undefined ? { denyLabel: confirmation.denyLabel } : {}),
              onConfirm: () => {
                send({ intent: "confirm", confirmationId: confirmation.id });
                setConfirmation(null);
              },
              onDeny: () => {
                send({ intent: "deny", confirmationId: confirmation.id });
                setConfirmation(null);
              },
            },
          }
        : {})}
    />
  );
}

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(<SidePanel />);
}
