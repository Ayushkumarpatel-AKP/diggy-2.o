/**
 * @diggy/reminders — one-shot, host-agnostic reminder engine.
 *
 * Users set reminders in natural language; DIGGY fires each exactly once
 * through the host's notifier + avatar. Nothing here touches the network,
 * `chrome` or the DOM: persistence is injected, so the same store runs in
 * the MV3 service worker and Vitest.
 *
 * // INTERFACE FOR INTEGRATION — exported surface (repeat, keep in sync):
 * //
 * //   import type { Reminder, ReminderInput, ReminderPersistence } from "@diggy/reminders";
 * //   import type { ReminderEvent, ReminderEventKind } from "@diggy/reminders";
 * //   import type { ReminderNotifier, ReminderAvatar } from "@diggy/reminders";
 * //
 * //   new ReminderStore(persistence?, { now?, idFactory? }?)
 * //     // add(input): Reminder            (rejects past dueAt, caps at MAX_REMINDERS)
 * //     // list(): Reminder[] ; get(id): Reminder | undefined
 * //     // remove(id): boolean ; complete(id): boolean ; markFired(id, at): boolean
 * //     // due(now?): Reminder[] ; load(): Promise<void>
 * //   class MemoryReminderPersistence implements ReminderPersistence
 * //   const MAX_REMINDERS = 100
 * //
 * //   createReminderEngine({ store, notifier?, avatar?, onEvent?, now? }): ReminderEngine
 * //     // add / list / remove / complete / fireDue(now?): Promise<ReminderEvent[]>
 * //     // nextDueAt(now?): number | null
 * //   createNoopReminderNotifier(): ReminderNotifier ; createNoopReminderAvatar(): ReminderAvatar
 * //
 * //   const REMINDER_ALARM_PREFIX = "diggy:reminder:"
 * //   reminderAlarmName(id): string ; isReminderAlarm(name): boolean
 * //   reminderIdFromAlarm(name): string | null ; nextDueAt(reminders, now?): number | null
 */
export * from "./types.js";
export * from "./store.js";
export * from "./schedule.js";
export * from "./engine.js";
