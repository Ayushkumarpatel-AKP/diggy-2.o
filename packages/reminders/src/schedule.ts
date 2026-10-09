/**
 * Alarm naming + next-due computation for the extension host.
 *
 * Scheduling itself lives in the extension (`chrome.alarms`, one-shot and
 * precise — a minute-granular `periodInMinutes` would fire up to 59s late):
 * the host creates `reminderAlarmName(id)` with `{ when: dueAt }` and routes
 * the alarm back to the engine's `fireDue`.
 */
import type { Reminder } from "./types.js";

/** Prefix for one-shot `chrome.alarms` names carrying a reminder id. */
export const REMINDER_ALARM_PREFIX = "diggy:reminder:";

/** Alarm name scheduling the reminder with `id`. */
export function reminderAlarmName(id: string): string {
  return `${REMINDER_ALARM_PREFIX}${id}`;
}

/** Whether an alarm name belongs to a reminder. */
export function isReminderAlarm(name: string): boolean {
  return name.startsWith(REMINDER_ALARM_PREFIX);
}

/** The reminder id carried by an alarm name, or null when it carries none. */
export function reminderIdFromAlarm(name: string): string | null {
  if (!isReminderAlarm(name)) return null;
  const id = name.slice(REMINDER_ALARM_PREFIX.length);
  return id ? id : null;
}

/** Earliest `dueAt` among pending reminders, or null when none is pending. */
export function nextDueAt(reminders: readonly Reminder[], now: number = Date.now()): number | null {
  void now;
  let next: number | null = null;
  for (const reminder of reminders) {
    if (reminder.done || reminder.firedAt !== undefined) continue;
    if (next === null || reminder.dueAt < next) next = reminder.dueAt;
  }
  return next;
}
