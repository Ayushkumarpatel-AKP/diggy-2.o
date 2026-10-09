/**
 * Reminder store — the in-memory list plus its injected persistence.
 *
 * `dueAt` is an absolute epoch-ms number. Adding a reminder at or before
 * `now` throws (the model is already told never to set one; this is the
 * hard guard). The list is capped at {@link MAX_REMINDERS}.
 *
 * Nothing here touches the network or `chrome`; persistence is injected so
 * the same store runs in the service worker and Vitest. Mutations are
 * write-through (`save` on every change); `load` rehydrates once.
 */
import type { Reminder, ReminderInput, ReminderPersistence } from "./types.js";

/** Maximum number of reminders a user may keep. */
export const MAX_REMINDERS = 100;

/** In-memory {@link ReminderPersistence} (the default; survives for the process). */
export class MemoryReminderPersistence implements ReminderPersistence {
  private reminders: Reminder[] = [];

  load(): Reminder[] {
    return this.reminders.map((reminder) => ({ ...reminder }));
  }

  save(reminders: readonly Reminder[]): void {
    this.reminders = reminders.map((reminder) => ({ ...reminder }));
  }
}

export interface ReminderStoreOptions {
  now?: () => number;
  idFactory?: () => string;
}

function clone(reminder: Reminder): Reminder {
  return { ...reminder };
}

export class ReminderStore {
  private reminders: Reminder[] = [];
  private loaded = false;
  private counter = 0;

  constructor(
    private readonly persistence: ReminderPersistence = new MemoryReminderPersistence(),
    private readonly options: ReminderStoreOptions = {},
  ) {}

  /** Load persisted reminders once and rehydrate the in-memory list. */
  async load(): Promise<void> {
    if (this.loaded) return;
    const stored = await this.persistence.load();
    this.reminders = stored.map(clone);
    for (const reminder of this.reminders) {
      const match = /^rem-(\d+)$/.exec(reminder.id);
      if (match) this.counter = Math.max(this.counter, Number(match[1]));
    }
    this.loaded = true;
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  private nextId(): string {
    const factory = this.options.idFactory;
    if (factory) return factory();
    this.counter += 1;
    return `rem-${this.counter}`;
  }

  private persist(): void {
    const result = this.persistence.save(this.reminders.map(clone));
    if (result instanceof Promise) result.catch(() => undefined);
  }

  list(): Reminder[] {
    return this.reminders.map(clone);
  }

  get(id: string): Reminder | undefined {
    const found = this.reminders.find((reminder) => reminder.id === id);
    return found ? clone(found) : undefined;
  }

  add(input: ReminderInput): Reminder {
    const now = this.now();
    const title = input.title?.trim();
    if (!title) throw new Error("Reminder title is required.");
    if (!Number.isFinite(input.dueAt)) throw new Error("Reminder dueAt must be an epoch-ms number.");
    if (input.dueAt <= now) {
      throw new Error(`Reminder dueAt is in the past: ${input.dueAt} (now ${now}).`);
    }
    if (this.reminders.length >= MAX_REMINDERS) {
      throw new Error(`You can keep at most ${MAX_REMINDERS} reminders.`);
    }
    const reminder: Reminder = { id: this.nextId(), title, dueAt: input.dueAt, done: false, createdAt: now };
    if (input.notes !== undefined) reminder.notes = input.notes;
    if (input.command !== undefined) reminder.command = input.command;
    this.reminders.push(reminder);
    this.persist();
    return clone(reminder);
  }

  remove(id: string): boolean {
    const before = this.reminders.length;
    this.reminders = this.reminders.filter((reminder) => reminder.id !== id);
    if (this.reminders.length === before) return false;
    this.persist();
    return true;
  }

  complete(id: string): boolean {
    const target = this.reminders.find((reminder) => reminder.id === id);
    if (!target) return false;
    if (!target.done) {
      target.done = true;
      this.persist();
    }
    return true;
  }

  /** Stamp `firedAt`; returns false when already fired, done, or unknown. */
  markFired(id: string, at: number): boolean {
    const target = this.reminders.find((reminder) => reminder.id === id);
    if (!target || target.done || target.firedAt !== undefined) return false;
    target.firedAt = at;
    this.persist();
    return true;
  }

  /** Reminders that are neither done nor fired and whose `dueAt <= now`. */
  due(now: number = this.now()): Reminder[] {
    return this.reminders
      .filter((reminder) => !reminder.done && reminder.firedAt === undefined && reminder.dueAt <= now)
      .sort((a, b) => a.dueAt - b.dueAt)
      .map(clone);
  }
}
