/**
 * Assistant — the chat surface. Everything here is real: the buttons perform
 * work through the runtime, and the conversation area shows an honest empty
 * state until there is something to show.
 *
 * // INTERFACE FOR INTEGRATION
 * interface AssistantScreenProps { onCommand(label: string, intent?: string): void;
 *   state?: ScreenState; preview?: boolean }
 * // END INTERFACE FOR INTEGRATION
 */
import { DiggyLogo } from "../../DiggyLogo.js";
import { Icon } from "../../Icon.js";
import { Panel } from "../../primitives/Card.js";
import { StateBlock, PreviewBadge, type ScreenState } from "../ScreenState.js";
import { ScreenHeader } from "../ScreenHeader.js";

export interface AssistantScreenProps {
  onCommand: (label: string, intent?: string) => void;
  state?: ScreenState;
  preview?: boolean;
}

/** The real things DIGGY can do with the page you are on. */
const ASSIST_ACTIONS: readonly { label: string; icon: "file" | "sparkle" | "monitor" | "layers" }[] = [
  { label: "Summarize this page", icon: "file" },
  { label: "Explain page", icon: "sparkle" },
  { label: "Track this page", icon: "monitor" },
  { label: "Extract important info", icon: "layers" },
];

export function AssistantScreen({
  onCommand,
  state = "empty",
  preview = false,
}: AssistantScreenProps) {
  return (
    <>
      <ScreenHeader
        icon="assistant"
        tone="violet"
        title="Assistant"
        subtitle="Ask about this page, or let DIGGY act on it."
      >
        {preview ? <PreviewBadge /> : null}
        <button
          type="button"
          className="dg-select"
          onClick={() => onCommand("Provider settings")}
          title="Choose your model provider"
        >
          Provider settings <Icon name="chevronDown" size={14} />
        </button>
      </ScreenHeader>

      <div className="dg-chat">
        <div className="dg-inline">
          <span className="dg-status__avatar">
            <DiggyLogo size={30} />
          </span>
          <div className="dg-bubble dg-bubble--speech">
            <span className="dg-bubble__priority dg-dot--ok" aria-hidden="true" />
            Ask me anything about this page — or press Ctrl+Space and just talk.
          </div>
        </div>

        <Panel title="What I can do here">
          <div className="dg-inline" style={{ flexWrap: "wrap" }}>
            {ASSIST_ACTIONS.map((action) => (
              <button
                key={action.label}
                type="button"
                className="dg-chip"
                onClick={() => onCommand(action.label)}
              >
                <Icon name={action.icon} size={14} /> {action.label}
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="Conversation">
          <StateBlock
            state={state === "ready" ? "empty" : state}
            icon="assistant"
            title={state === "loading" ? "Reading this page…" : "No conversation yet"}
            message={
              state === "error"
                ? "The model didn’t respond. Add or check your provider key in settings, then try again."
                : "Use a button above, type below, or hold Ctrl+Space and speak — the answer shows here and DIGGY says it out loud."
            }
            onRetry={() => onCommand("Retry")}
          />
        </Panel>
      </div>
    </>
  );
}
