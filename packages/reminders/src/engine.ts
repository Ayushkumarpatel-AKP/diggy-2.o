/**
 * The reminder engine — one-shot delivery over an injected store.
 *
 * `fireDue(now)` fires every due reminder exactly once: each is stamped
 * `firedAt` synchronously before any notification runs, so a second call
 * with the same `now` finds nothing left to fire. Delivery (notifier +
 * avatar) is best-effort and never rejects the call.
 */
import { nextDueAt as nextPendingDueAt } from "./schedule.js";
import { ReminderStore } from "./store.js";
import type {
  Reminder,
  ReminderAvatar,
  ReminderEvent,
  ReminderInput,
  ReminderNotifier,
} from "./types.js";

/** Options for {@link createReminderEngine}. */
export interface ReminderEngineOptions {
  store: ReminderStore;
  /** Delivery (default: noop). */
  notifier?: ReminderNotifier;
  /** Avatar reactions (default: noop). */
  avatar?: ReminderAvatar;
  onEvent?: (event: ReminderEvent) => void;
  now?: () => number;
}

/** The engine surface. */
export interface ReminderEngine {
  add(input: ReminderInput): Reminder;
  list(): Reminder[];
  remove(id: string): boolean;
  complete(id: string): boolean;
  fireDue(now?: number): Promise<ReminderEvent[]>;
  nextDueAt(now?: number): number | null;
}

/** A no-op notifier (headless/server contexts). */
export function createNoopReminderNotifier(): ReminderNotifier {
  return { notify() {} };
}

/** A no-op avatar (headless/server contexts). */
export function createNoopReminderAvatar(): ReminderAvatar {
  return { announce() {} };
}

/** Build a one-shot reminder engine. */
export function createReminderEngine(options: ReminderEngineOptions): ReminderEngine {
  const store = options.store;
  const notifier = options.notifier ?? createNoopReminderNotifier();
  const avatar = options.avatar ?? createNoopReminderAvatar();
  const now = options.now ?? (() => Date.now());
  const onEvent = options.onEvent;

  function emit(event: ReminderEvent): void {
    try {
      onEvent?.(event);
    } catch {
      /* a listener throwing must not break the engine */
    }
  }

  return {
    add(input: ReminderInput): Reminder {
      const reminder = store.add(input);
      emit({ kind: "created", reminder, at: now() });
      return reminder;
    },

    list(): Reminder[] {
      return store.list();
    },

    remove(id: string): boolean {
      const existing = store.get(id);
      if (!existing) return false;
      const removed = store.remove(id);
      if (removed) emit({ kind: "removed", reminder: existing, at: now() });
      return removed;
    },

    complete(id: string): boolean {
      const existing = store.get(id);
      if (!existing) return false;
      const completed = store.complete(id);
      if (completed && !existing.done) {
        emit({ kind: "completed", reminder: { ...existing, done: true }, at: now() });
      }
      return completed;
    },

    async fireDue(at: number = now()): Promise<ReminderEvent[]> {
      const due = store.due(at);
      const stamped: Reminder[] = [];
      for (const reminder of due) {
        if (store.markFired(reminder.id, at)) {
          const current = store.get(reminder.id);
          if (current) stamped.push(current);
        }
      }
      const events: ReminderEvent[] = stamped.map((reminder) => ({ kind: "fired", reminder, at }));
      for (const event of events) {
        emit(event);
        try {
          await notifier.notify(event.reminder);
        } catch {
          /* delivery is best-effort */
        }
        try {
          avatar.announce(event.reminder);
        } catch {
          /* the avatar is best-effort */
        }
      }
      return events;
    },

    nextDueAt(at: number = now()): number | null {
      return nextPendingDueAt(store.list(), at);
    },
  };
}
