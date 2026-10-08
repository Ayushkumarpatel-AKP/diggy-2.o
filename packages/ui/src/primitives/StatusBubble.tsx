/**
 * Status / thought bubble anchored to the avatar head.
 * One line at a time, 💭 thought or speech styling, priority dot, typewriter reveal,
 * collapse to a 💭 chip. Consumes the `AvatarAPI.status` contract when provided so the
 * avatar renderer hears the same line the user reads.
 *
 * // INTERFACE FOR INTEGRATION
 * interface StatusBubbleProps {
 *   text: string;
 *   priority?: StatusPriority;              // 0..3 -> dot colour
 *   variant?: "thought" | "speech";
 *   typing?: boolean; typingSpeed?: number;
 *   collapsed?: boolean; onToggleCollapse?: () => void;
 *   avatar?: ReactNode;                      // avatar renderer slot (packages/avatar)
 *   api?: Pick<AvatarAPI, "status">;         // consumes AvatarAPI.status
 * }
 * // END INTERFACE FOR INTEGRATION
 */
import { useEffect, useState, type ReactNode } from "react";
import type { AvatarAPI } from "@diggy/shared";

import { DiggyLogo } from "../DiggyLogo.js";
import { PRIORITY_DOT, type StatusPriority } from "../hooks/statusQueue.js";

export interface StatusBubbleProps {
  text: string;
  priority?: StatusPriority;
  variant?: "thought" | "speech";
  typing?: boolean;
  typingSpeed?: number;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  avatar?: ReactNode;
  api?: Pick<AvatarAPI, "status">;
  className?: string;
}

export function StatusBubble({
  text,
  priority = 0,
  variant = "thought",
  typing = true,
  typingSpeed = 22,
  collapsed,
  onToggleCollapse,
  avatar,
  api,
  className,
}: StatusBubbleProps) {
  const [revealed, setRevealed] = useState(typing ? 0 : text.length);

  useEffect(() => {
    if (!typing || typingSpeed <= 0) {
      setRevealed(text.length);
      return;
    }
    setRevealed(0);
    let index = 0;
    const timer = setInterval(() => {
      index += 1;
      setRevealed(Math.min(index, text.length));
      if (index >= text.length) clearInterval(timer);
    }, typingSpeed);
    return () => clearInterval(timer);
  }, [text, typing, typingSpeed]);

  // Push the line to the avatar renderer (contract: AvatarAPI.status).
  useEffect(() => {
    api?.status(text);
  }, [api, text]);

  const avatarSlot = (
    <span className="dg-status__avatar">{avatar ?? <DiggyLogo size={30} dots={false} />}</span>
  );

  if (collapsed) {
    return (
      <button
        type="button"
        className={["dg-status", className ?? ""].join(" ").trim()}
        onClick={onToggleCollapse}
        aria-label="Expand DIGGY status"
      >
        {avatarSlot}
        <span className="dg-bubble dg-bubble--chip" title={text}>
          <span className={`dg-bubble__priority ${PRIORITY_DOT[priority]}`} />
          <span aria-hidden="true">💭</span>
        </span>
      </button>
    );
  }

  const shown = text.slice(0, revealed);
  const isTyping = revealed < text.length;

  return (
    <div className={["dg-status", className ?? ""].join(" ").trim()}>
      {avatarSlot}
      <div className={`dg-bubble dg-bubble--${variant}`} role="status" aria-live="polite">
        <span className={`dg-bubble__priority ${PRIORITY_DOT[priority]}`} aria-hidden="true" />
        <span className={isTyping ? "dg-bubble__text dg-typewriter" : "dg-bubble__text"}>
          {shown}
        </span>
        {onToggleCollapse ? (
          <button
            type="button"
            className="dg-linkbtn"
            onClick={onToggleCollapse}
            aria-label="Collapse DIGGY status"
          >
            💭
          </button>
        ) : null}
      </div>
    </div>
  );
}
