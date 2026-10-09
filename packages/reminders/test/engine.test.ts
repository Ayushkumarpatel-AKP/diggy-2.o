import { describe, expect, it, vi } from "vitest";
import {
  createNoopReminderAvatar,
  createNoopReminderNotifier,
  createReminderEngine,
  type ReminderEngine,
} from "../src/engine.js";
import { MemoryReminderPersistence, ReminderStore } from "../src/store.js";
import type { Reminder, ReminderEvent } from "../src/types.js";

const NOW = 1_000_000;

function setup(): {
  engine: ReminderEngine;
  store: ReminderStore;
  events: ReminderEvent[];
  notified: Reminder[];
  announced: Reminder[];
} {
  const events: ReminderEvent[] = [];
  const notified: Reminder[] = [];
  const announced: Reminder[] = [];
  const store = new ReminderStore(new MemoryReminderPersistence(), { now: () => NOW });
  const engine = createReminderEngine({
    store,
    notifier: {
      notify(reminder: Reminder): void {
        notified.push(reminder);
      },
    },
    avatar: {
      announce(reminder: Reminder): void {
        announced.push(reminder);
      },
    },
    onEvent: (event) => events.push(event),
    now: () => NOW,
  });
  return { engine, store, events, notified, announced };
}

describe("ReminderEngine CRUD events", () => {
  it("emits created/removed/completed around the store", () => {
    const { engine, events } = setup();
    const reminder = engine.add({ title: "A", dueAt: NOW + 1_000 });
    expect(events.map((event) => event.kind)).toEqual(["created"]);
    expect(engine.list()).toHaveLength(1);

    expect(engine.remove("missing")).toBe(false);
    expect(engine.remove(reminder.id)).toBe(true);
    expect(engine.complete(reminder.id)).toBe(false);
    expect(events.map((event) => event.kind)).toEqual(["created", "removed"]);

    const second = engine.add({ title: "B", dueAt: NOW + 2_000 });
    expect(engine.complete(second.id)).toBe(true);
    expect(events.map((event) => event.kind)).toEqual(["created", "removed", "created", "completed"]);
    expect(events.at(-1)?.reminder.done).toBe(true);
  });
});

describe("ReminderEngine fireDue", () => {
  it("fires each due reminder at most once and stamps firedAt", async () => {
    const { engine, events, notified, announced } = setup();
    const first = engine.add({ title: "First", dueAt: NOW + 1_000 });
    engine.add({ title: "Later", dueAt: NOW + 60_000 });

    expect(await engine.fireDue(NOW + 500)).toHaveLength(0);

    const fired = await engine.fireDue(NOW + 1_000);
    expect(fired).toHaveLength(1);
    expect(fired[0]).toMatchObject({ kind: "fired", at: NOW + 1_000 });
    expect(fired[0]?.reminder).toMatchObject({ id: first.id, firedAt: NOW + 1_000, done: false });
    expect(notified.map((reminder) => reminder.id)).toEqual([first.id]);
    expect(announced.map((reminder) => reminder.id)).toEqual([first.id]);

    // Idempotent: the same `now` fires nothing the second time.
    expect(await engine.fireDue(NOW + 1_000)).toHaveLength(0);
    expect(notified).toHaveLength(1);
    expect(events.filter((event) => event.kind === "fired")).toHaveLength(1);
  });

  it("never fires completed reminders", async () => {
    const { engine } = setup();
    const reminder = engine.add({ title: "A", dueAt: NOW + 1_000 });
    engine.complete(reminder.id);
    expect(await engine.fireDue(NOW + 2_000)).toHaveLength(0);
  });

  it("survives throwing notifiers, avatars, and listeners", async () => {
    const store = new ReminderStore(new MemoryReminderPersistence(), { now: () => NOW });
    const engine = createReminderEngine({
      store,
      notifier: {
        notify(): void {
          throw new Error("notify down");
        },
      },
      avatar: {
        announce(): void {
          throw new Error("avatar down");
        },
      },
      onEvent: () => {
        throw new Error("listener down");
      },
      now: () => NOW,
    });
    engine.add({ title: "A", dueAt: NOW + 1 });
    await expect(engine.fireDue(NOW + 1)).resolves.toHaveLength(1);
    await expect(engine.fireDue(NOW + 1)).resolves.toHaveLength(0);
  });

  it("runs without notifier/avatar (noop defaults)", async () => {
    const store = new ReminderStore(new MemoryReminderPersistence(), { now: () => NOW });
    const engine = createReminderEngine({ store, now: () => NOW });
    expect(createNoopReminderNotifier()).toBeDefined();
    expect(createNoopReminderAvatar()).toBeDefined();
    engine.add({ title: "A", dueAt: NOW + 1 });
    await expect(engine.fireDue(NOW + 1)).resolves.toHaveLength(1);
  });
});

describe("ReminderEngine nextDueAt", () => {
  it("returns the earliest pending reminder", () => {
    const { engine } = setup();
    expect(engine.nextDueAt()).toBeNull();
    engine.add({ title: "Later", dueAt: NOW + 60_000 });
    engine.add({ title: "Sooner", dueAt: NOW + 1_000 });
    expect(engine.nextDueAt()).toBe(NOW + 1_000);
  });

  it("notifier spies observe fired reminders", async () => {
    const notify = vi.fn();
    const store = new ReminderStore(new MemoryReminderPersistence(), { now: () => NOW });
    const engine = createReminderEngine({ store, notifier: { notify }, now: () => NOW });
    engine.add({ title: "A", dueAt: NOW + 1 });
    await engine.fireDue(NOW + 1);
    expect(notify).toHaveBeenCalledTimes(1);
  });
});
