import { describe, expect, it } from "vitest";
import { MAX_REMINDERS, MemoryReminderPersistence, ReminderStore } from "../src/store.js";
import type { Reminder } from "../src/types.js";

const NOW = 1_000_000;

function storeWithClock(): ReminderStore {
  return new ReminderStore(new MemoryReminderPersistence(), { now: () => NOW });
}

describe("ReminderStore add/list/get", () => {
  it("assigns rem-<n> ids and returns clones", () => {
    const store = storeWithClock();
    const first = store.add({ title: "Play the video", dueAt: NOW + 60_000, command: "play video" });
    const second = store.add({ title: "Call back", dueAt: NOW + 120_000, notes: "ask about the bill" });
    expect(first.id).toBe("rem-1");
    expect(second.id).toBe("rem-2");
    expect(first).toMatchObject({ title: "Play the video", dueAt: NOW + 60_000, done: false, createdAt: NOW });
    expect(second.notes).toBe("ask about the bill");

    expect(store.list().map((reminder) => reminder.id)).toEqual(["rem-1", "rem-2"]);
    expect(store.get("rem-1")).toEqual(first);
    expect(store.get("missing")).toBeUndefined();
  });

  it("uses an injectable idFactory when provided", () => {
    let counter = 0;
    const store = new ReminderStore(new MemoryReminderPersistence(), {
      now: () => NOW,
      idFactory: () => `test-${(counter += 1)}`,
    });
    expect(store.add({ title: "A", dueAt: NOW + 1 }).id).toBe("test-1");
  });

  it("rejects a missing title", () => {
    const store = storeWithClock();
    expect(() => store.add({ title: "  ", dueAt: NOW + 1 })).toThrow(/title/);
  });

  it("rejects a past dueAt with a `past` error", () => {
    const store = storeWithClock();
    expect(() => store.add({ title: "Late", dueAt: NOW })).toThrow(/past/);
    expect(() => store.add({ title: "Later", dueAt: NOW - 1 })).toThrow(/past/);
    expect(store.list()).toHaveLength(0);
  });

  it("caps the list at MAX_REMINDERS", () => {
    const store = storeWithClock();
    for (let i = 0; i < MAX_REMINDERS; i += 1) {
      store.add({ title: `Reminder ${i}`, dueAt: NOW + i + 1 });
    }
    expect(store.list()).toHaveLength(MAX_REMINDERS);
    expect(() => store.add({ title: "One too many", dueAt: NOW + 1 })).toThrow(/at most/);
  });
});

describe("ReminderStore remove/complete", () => {
  it("removes by id and reports unknown ids", () => {
    const store = storeWithClock();
    const reminder = store.add({ title: "A", dueAt: NOW + 1 });
    expect(store.remove("missing")).toBe(false);
    expect(store.remove(reminder.id)).toBe(true);
    expect(store.list()).toHaveLength(0);
    expect(store.remove(reminder.id)).toBe(false);
  });

  it("completes by id and keeps fired/completed distinct", () => {
    const store = storeWithClock();
    const reminder = store.add({ title: "A", dueAt: NOW + 1 });
    expect(store.complete("missing")).toBe(false);
    expect(store.complete(reminder.id)).toBe(true);
    expect(store.get(reminder.id)).toMatchObject({ done: true });
    expect(store.get(reminder.id)?.firedAt).toBeUndefined();
    expect(store.complete(reminder.id)).toBe(true);
  });
});

describe("ReminderStore due()", () => {
  it("returns only pending reminders whose dueAt has passed, earliest first", () => {
    const store = storeWithClock();
    const later = store.add({ title: "Later", dueAt: NOW + 2_000 });
    const sooner = store.add({ title: "Sooner", dueAt: NOW + 1_000 });
    const done = store.add({ title: "Done", dueAt: NOW + 500 });
    store.complete(done.id);
    const fired = store.add({ title: "Fired", dueAt: NOW + 500 });
    expect(store.markFired(fired.id, NOW)).toBe(true);

    expect(store.due(NOW)).toHaveLength(0);
    const due = store.due(NOW + 2_000);
    expect(due.map((reminder) => reminder.id)).toEqual([sooner.id, later.id]);
  });

  it("markFired refuses unknown, done, or already-fired reminders", () => {
    const store = storeWithClock();
    expect(store.markFired("missing", NOW)).toBe(false);
    const reminder = store.add({ title: "A", dueAt: NOW + 1 });
    expect(store.markFired(reminder.id, NOW)).toBe(true);
    expect(store.markFired(reminder.id, NOW)).toBe(false);
    expect(store.get(reminder.id)?.firedAt).toBe(NOW);
  });
});

describe("ReminderStore persistence round-trip", () => {
  it("writes through on mutation and rehydrates on load()", async () => {
    const persistence = new MemoryReminderPersistence();
    const first = new ReminderStore(persistence, { now: () => NOW });
    first.add({ title: "Persisted", dueAt: NOW + 1_000, command: "do it" });

    // Write-through: visible in the persistence without an explicit save.
    expect(persistence.load()).toHaveLength(1);

    const second = new ReminderStore(persistence, { now: () => NOW + 5_000 });
    await second.load();
    expect(second.list()).toHaveLength(1);
    expect(second.get("rem-1")).toMatchObject({ title: "Persisted", command: "do it" });

    // load() is idempotent and keeps default ids collision-free after rehydrate.
    await second.load();
    expect(second.add({ title: "Next", dueAt: NOW + 6_000 }).id).toBe("rem-2");
  });

  it("supports async persistence implementations", async () => {
    let held: Reminder[] = [];
    const asyncPersistence = {
      async load(): Promise<Reminder[]> {
        return held.map((reminder) => ({ ...reminder }));
      },
      async save(reminders: readonly Reminder[]): Promise<void> {
        held = reminders.map((reminder) => ({ ...reminder }));
      },
    };
    const store = new ReminderStore(asyncPersistence, { now: () => NOW });
    store.add({ title: "Async", dueAt: NOW + 1 });
    const revived = new ReminderStore(asyncPersistence, { now: () => NOW });
    await revived.load();
    expect(revived.list()).toHaveLength(1);
  });
});
