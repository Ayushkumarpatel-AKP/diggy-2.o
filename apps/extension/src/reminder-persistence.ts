/**
 * Reminder persistence over `browser.storage.local` (`diggy:reminders`).
 *
 * The `@diggy/reminders` adapter for the extension: load/save the `Reminder[]`
 * array through the same storage style as `google.ts` (single-key get/set,
 * tolerant reads that fall back to an empty list).
 */

// Type-only import; `@diggy/reminders` is a workspace dependency of this app.
import type { Reminder, ReminderPersistence } from "@diggy/reminders";
import { browser } from "wxt/browser";

/** Storage key holding the `Reminder[]` array. */
export const REMINDERS_STORAGE_KEY = "diggy:reminders";

function normalize(raw: unknown): Reminder[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is Reminder =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as Reminder).id === "string" &&
      typeof (item as Reminder).dueAt === "number",
  );
}

/** `ReminderPersistence` backed by `browser.storage.local`. */
export function createChromeReminderPersistence(): ReminderPersistence {
  return {
    async load(): Promise<Reminder[]> {
      try {
        const store = (await browser.storage.local.get(REMINDERS_STORAGE_KEY)) as Record<string, unknown>;
        return normalize(store[REMINDERS_STORAGE_KEY]);
      } catch {
        return [];
      }
    },
    async save(reminders: readonly Reminder[]): Promise<void> {
      await browser.storage.local.set({ [REMINDERS_STORAGE_KEY]: [...reminders] });
    },
  };
}
