/**
 * Reminder shapes — host-agnostic, no `chrome`, no DOM.
 *
 * A reminder is one-shot: `fireDue` stamps `firedAt` exactly once, while
 * `done` stays false until the user completes it (fired ≠ completed).
 */
export interface Reminder {
  id: string;
  title: string;
  /** Absolute epoch-ms when the reminder becomes due. */
  dueAt: number;
  notes?: string;
  /** Natural-language command to run when the user confirms after firing. */
  command?: string;
  done: boolean;
  createdAt: number;
  /** Set once by `fireDue`; never set twice. */
  firedAt?: number;
}

/** The fields a caller supplies when creating a reminder. */
export interface ReminderInput {
  title: string;
  dueAt: number;
  notes?: string;
  command?: string;
}

/** Injected persistence (extension storage, JSON file, in-memory, …). */
export interface ReminderPersistence {
  load(): Promise<Reminder[]> | Reminder[];
  save(reminders: readonly Reminder[]): Promise<void> | void;
}

/** Lifecycle events surfaced through `onEvent`. */
export type ReminderEventKind = "created" | "fired" | "removed" | "completed";

export interface ReminderEvent {
  kind: ReminderEventKind;
  reminder: Reminder;
  at: number;
}

/** Delivers a fired reminder to the user (notification). */
export interface ReminderNotifier {
  notify(reminder: Reminder): Promise<void> | void;
}

/** Speaks a fired reminder on the avatar. */
export interface ReminderAvatar {
  announce(reminder: Reminder): void;
}
