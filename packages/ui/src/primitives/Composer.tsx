/**
 * The DIGGY composer — a controlled input that actually sends.
 *
 * Enter (or the Send button) fires `onSend(text)` with the trimmed draft; the mic starts
 * voice; attach-file is disabled with a visible reason because it is not implemented yet.
 *
 * // INTERFACE FOR INTEGRATION
 * interface ComposerProps { value: string; onChange(value: string): void;
 *   onSend(text: string): void; onVoice?: () => void; placeholder?: string;
 *   disabled?: boolean; voiceDisabledReason?: string }
 * function Composer(props: ComposerProps): JSX.Element;
 * // END INTERFACE FOR INTEGRATION
 */
import { useState, type FormEvent, type KeyboardEvent } from "react";

import { Icon } from "../Icon.js";
import { IconButton } from "./IconButton.js";

export interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (text: string) => void;
  onVoice?: () => void;
  placeholder?: string;
  disabled?: boolean;
  /** Shown on the mic when voice has no handler in this host. */
  voiceDisabledReason?: string;
}

export function Composer({
  value,
  onChange,
  onSend,
  onVoice,
  placeholder = "Ask Diggy anything…",
  disabled = false,
  voiceDisabledReason = "Voice is available in the browser panel.",
}: ComposerProps) {
  const [sent, setSent] = useState(false);
  const draft = value.trim();
  const canSend = !disabled && draft.length > 0;

  const submit = () => {
    if (!canSend) return;
    onSend(draft);
    setSent(true);
    window.setTimeout(() => setSent(false), 1200);
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form className="dg-composer" onSubmit={onSubmit} aria-label="Message DIGGY">
      <input
        className="dg-composer__input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label="Message DIGGY"
        disabled={disabled}
      />
      <IconButton
        icon="mic"
        label="Start voice input"
        onClick={onVoice}
        disabledReason={onVoice ? undefined : voiceDisabledReason}
      />
      <IconButton
        icon="paperclip"
        label="Attach file"
        disabledReason="Attaching files isn’t available yet."
      />
      <button
        type="submit"
        className="dg-composer__send"
        aria-label={sent ? "Message sent" : "Send message"}
        title={canSend ? "Send message" : "Type a message first"}
        disabled={!canSend}
        aria-disabled={!canSend}
      >
        <Icon name={sent ? "check" : "send"} size={17} />
      </button>
    </form>
  );
}
