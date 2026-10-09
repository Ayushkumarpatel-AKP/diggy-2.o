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

import { Dashboard } from "../../../../packages/ui/src/index.js";
import type { BubbleStyle, StatusPriority } from "../../../../packages/ui/src/index.js";
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

/** The one channel from the panel to the runtime. */
function send(message: Record<string, unknown>): void {
  void browser.runtime.sendMessage({ type: "diggy:command", ...message }).catch(() => undefined);
}

function SidePanel() {
  const [liveStatus, setLiveStatus] = useState<LiveStatus | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

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
      return undefined;
    };

    browser.runtime.onMessage.addListener(onMessage);
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
                send({ intent: "deny" });
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
