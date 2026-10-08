/**
 * Queue manager for the avatar status bubble: priority ordering, one line at a time,
 * auto-advance, and collapse-to-chip.
 *
 * // INTERFACE FOR INTEGRATION
 * interface StatusUpdate { text: string; priority?: StatusPriority; style?: BubbleStyle;
 *   mood?: AvatarState; id?: string }
 * interface UseStatusQueueResult { current: StatusItem | null; pending: StatusItem[];
 *   collapsed: boolean; push(update: StatusUpdate): void; clear(): void;
 *   toggleCollapse(): void; setCollapsed(value: boolean): void }
 * function useStatusQueue(options?: { typingSpeed?: number; holdMs?: number }):
 *   UseStatusQueueResult;
 * // END INTERFACE FOR INTEGRATION
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { AvatarState } from "@diggy/shared";

import {
  insertByPriority,
  truncateStatus,
  type BubbleStyle,
  type StatusItem,
  type StatusPriority,
} from "./statusQueue.js";

export interface StatusUpdate {
  text: string;
  priority?: StatusPriority;
  style?: BubbleStyle;
  mood?: AvatarState;
  id?: string;
}

export interface UseStatusQueueResult {
  current: StatusItem | null;
  pending: StatusItem[];
  collapsed: boolean;
  push(update: StatusUpdate): void;
  clear(): void;
  toggleCollapse(): void;
  setCollapsed(value: boolean): void;
}

interface Machine {
  current: StatusItem | null;
  queue: StatusItem[];
}

export interface UseStatusQueueOptions {
  /** Typewriter speed in ms per character; 0 disables the reveal. */
  typingSpeed?: number;
  /** How long a fully-revealed line stays on screen before the next one. */
  holdMs?: number;
}

export function useStatusQueue(options: UseStatusQueueOptions = {}): UseStatusQueueResult {
  const { typingSpeed = 22, holdMs = 1600 } = options;
  const [machine, setMachine] = useState<Machine>({ current: null, queue: [] });
  const [collapsed, setCollapsed] = useState(false);
  const seq = useRef(0);

  const push = useCallback(
    (update: StatusUpdate) => {
      seq.current += 1;
      const item: StatusItem = {
        id: update.id ?? `status_${seq.current}`,
        text: truncateStatus(update.text),
        priority: update.priority ?? 0,
        style: update.style ?? "thought",
        mood: update.mood,
      };
      setMachine((prev) =>
        prev.current
          ? { current: prev.current, queue: insertByPriority(prev.queue, item) }
          : { current: item, queue: prev.queue },
      );
    },
    [],
  );

  const clear = useCallback(() => {
    setMachine({ current: null, queue: [] });
  }, []);

  useEffect(() => {
    const current = machine.current;
    if (!current) return;
    const duration = current.text.length * typingSpeed + holdMs;
    const timer = setTimeout(() => {
      setMachine((prev) => {
        const next = prev.queue[0];
        return { current: next ?? null, queue: prev.queue.slice(1) };
      });
    }, duration);
    return () => clearTimeout(timer);
  }, [machine.current, machine.queue, typingSpeed, holdMs]);

  const toggleCollapse = useCallback(() => setCollapsed((value) => !value), []);

  return { current: machine.current, pending: machine.queue, collapsed, push, clear, toggleCollapse, setCollapsed };
}
