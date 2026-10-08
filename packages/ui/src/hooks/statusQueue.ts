/**
 * Status-bubble queue logic — pure helpers, unit-tested without a DOM.
 * Higher priority wins; equal priority keeps FIFO order (stable).
 *
 * // INTERFACE FOR INTEGRATION
 * type BubbleStyle = "thought" | "speech";
 * type StatusPriority = 0 | 1 | 2 | 3;
 * interface StatusItem { id: string; text: string; priority: StatusPriority;
 *   style: BubbleStyle; mood?: AvatarState }
 * insertByPriority(queue: StatusItem[], item: StatusItem): StatusItem[];
 * truncateStatus(text: string, max?: number): string;
 * PRIORITY_DOT: Record<StatusPriority, string>;
 * // END INTERFACE FOR INTEGRATION
 */
import type { AvatarState } from "@diggy/shared";

export type BubbleStyle = "thought" | "speech";
export type StatusPriority = 0 | 1 | 2 | 3;

export interface StatusItem {
  id: string;
  text: string;
  priority: StatusPriority;
  style: BubbleStyle;
  mood?: AvatarState;
}

export const PRIORITY_DOT: Record<StatusPriority, string> = {
  0: "dg-dot--muted",
  1: "dg-dot--info",
  2: "dg-dot--warning",
  3: "dg-dot--danger",
};

/** Insert keeping descending priority; equal priorities stay in arrival order. */
export function insertByPriority(queue: readonly StatusItem[], item: StatusItem): StatusItem[] {
  const next = [...queue];
  const index = next.findIndex((existing) => existing.priority < item.priority);
  next.splice(index === -1 ? next.length : index, 0, item);
  return next;
}

/** One line at a time — collapse whitespace and clip to a sane bubble width. */
export function truncateStatus(text: string, max = 68): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}
