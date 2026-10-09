import { describe, expect, it } from "vitest";
import {
  REMINDER_ALARM_PREFIX,
  isReminderAlarm,
  nextDueAt,
  reminderAlarmName,
  reminderIdFromAlarm,
} from "../src/schedule.js";
import type { Reminder } from "../src/types.js";

function reminder(overrides: Partial<Reminder> & { id: string }): Reminder {
  return { title: "T", dueAt: 1_000, done: false, createdAt: 0, ...overrides };
}

describe("reminder alarm names", () => {
  it("round-trips an id through the alarm name", () => {
    expect(reminderAlarmName("rem-1")).toBe(`${REMINDER_ALARM_PREFIX}rem-1`);
    expect(REMINDER_ALARM_PREFIX).toBe("diggy:reminder:");
    expect(isReminderAlarm("diggy:reminder:rem-1")).toBe(true);
    expect(reminderIdFromAlarm("diggy:reminder:rem-1")).toBe("rem-1");
  });

  it("rejects foreign alarm names and empty ids", () => {
    expect(isReminderAlarm("diggy:monitor-tick")).toBe(false);
    expect(isReminderAlarm("")).toBe(false);
    expect(reminderIdFromAlarm("diggy:monitor-tick")).toBeNull();
    expect(reminderIdFromAlarm("diggy:reminder:")).toBeNull();
    expect(reminderIdFromAlarm("")).toBeNull();
  });
});

describe("nextDueAt", () => {
  it("returns the earliest pending dueAt", () => {
    const reminders = [
      reminder({ id: "a", dueAt: 3_000 }),
      reminder({ id: "b", dueAt: 1_000 }),
      reminder({ id: "c", dueAt: 2_000 }),
    ];
    expect(nextDueAt(reminders, 0)).toBe(1_000);
  });

  it("skips done and fired reminders", () => {
    const reminders = [
      reminder({ id: "done", dueAt: 1_000, done: true }),
      reminder({ id: "fired", dueAt: 1_500, firedAt: 2_000 }),
      reminder({ id: "pending", dueAt: 5_000 }),
    ];
    expect(nextDueAt(reminders, 0)).toBe(5_000);
  });

  it("returns null when nothing is pending", () => {
    expect(nextDueAt([], 0)).toBeNull();
    expect(nextDueAt([reminder({ id: "done", dueAt: 1_000, done: true })], 0)).toBeNull();
  });
});
