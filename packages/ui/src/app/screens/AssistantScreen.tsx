/**
 * Assistant — chat surface with page context, summary card and inline actions.
 *
 * // INTERFACE FOR INTEGRATION
 * interface AssistantScreenProps { onCommand(label: string, intent?: string): void }
 * // END INTERFACE FOR INTEGRATION
 */
import { BrowserDots, DiggyLogo } from "../../DiggyLogo.js";
import { Icon } from "../../Icon.js";
import { Pill } from "../../primitives/Pill.js";
import { ScreenHeader } from "../ScreenHeader.js";

export interface AssistantScreenProps {
  onCommand: (label: string, intent?: string) => void;
}

const SUMMARY_BULLETS = [
  "SIH 2026 results have been updated.",
  "Top 300 teams are shortlisted.",
  "Final round details will be shared soon.",
  "You can check your team status using your team ID.",
];

export function AssistantScreen({ onCommand }: AssistantScreenProps) {
  return (
    <>
      <ScreenHeader
        icon="assistant"
        tone="violet"
        title="Assistant"
        subtitle="Ask about this page, or let DIGGY act on it."
      >
        <button type="button" className="dg-select" onClick={() => onCommand("Model picker")}>
          Diggy (GPT-4o) <Icon name="chevronDown" size={14} />
        </button>
        <button
          type="button"
          className="dg-iconbtn"
          aria-label="Close assistant"
          onClick={() => onCommand("Close assistant")}
        >
          <Icon name="close" size={16} />
        </button>
      </ScreenHeader>

      <div className="dg-chat">
        <div className="dg-inline">
          <span className="dg-status__avatar">
            <DiggyLogo size={30} />
          </span>
          <div className="dg-bubble dg-bubble--speech">
            <span className="dg-bubble__priority dg-dot--ok" aria-hidden="true" />
            Ask me anything about this page!
          </div>
          <Pill tone="violet" icon="sparkle">
            Summarize this page
          </Pill>
        </div>

        <div className="dg-page-preview">
          <div className="dg-page-preview__bar">
            <BrowserDots small />
            <span className="dg-page-preview__url">https://sih.gov.in/results</span>
          </div>
          <div className="dg-page-preview__body">
            <div className="dg-inline" style={{ marginBottom: 12 }}>
              <strong style={{ fontSize: 13 }}>Results 2026</strong>
              <Pill tone="success" dot>
                Live
              </Pill>
            </div>
            <div className="dg-skeleton-line" />
            <div className="dg-skeleton-line" />
            <div className="dg-skeleton-line" />
          </div>
        </div>

        <div className="dg-msg">
          <h3 className="dg-msg__title">Here&apos;s a quick summary:</h3>
          <ul className="dg-bullets">
            {SUMMARY_BULLETS.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
          <div className="dg-inline" style={{ marginTop: 14, flexWrap: "wrap" }}>
            <button type="button" className="dg-chip" onClick={() => onCommand("Track this page")}>
              <Icon name="monitor" size={14} /> Track this page
            </button>
            <button
              type="button"
              className="dg-chip"
              onClick={() => onCommand("Find related opportunities")}
            >
              <Icon name="search" size={14} /> Find related opportunities
            </button>
            <button
              type="button"
              className="dg-chip"
              onClick={() => onCommand("Extract important info")}
            >
              <Icon name="layers" size={14} /> Extract important info
            </button>
          </div>
        </div>
      </div>

      <div className="dg-composer">
        <input placeholder="Ask Diggy anything…" aria-label="Message DIGGY" />
        <button
          type="button"
          className="dg-iconbtn"
          aria-label="Voice input"
          onClick={() => onCommand("Voice input")}
        >
          <Icon name="mic" size={17} />
        </button>
        <button
          type="button"
          className="dg-iconbtn"
          aria-label="Attach file"
          onClick={() => onCommand("Attach file")}
        >
          <Icon name="paperclip" size={17} />
        </button>
        <button
          type="button"
          className="dg-composer__send"
          aria-label="Send"
          onClick={() => onCommand("Send message")}
        >
          <Icon name="send" size={17} />
        </button>
      </div>
    </>
  );
}
