// fake-indexeddb installs a global indexedDB so Dexie works under Node.
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";

import { createActivityLog, type ActivityLog } from "./store.js";

const open: ActivityLog[] = [];
let dbCounter = 0;

function memoryLog(secrets?: Record<string, string>): ActivityLog {
  const log = createActivityLog({ persistent: false, secrets });
  open.push(log);
  return log;
}

function dbName(): string {
  dbCounter += 1;
  return `diggy-activity-test-${dbCounter}`;
}

afterEach(async () => {
  while (open.length > 0) {
    const log = open.pop() as ActivityLog;
    await log.close();
  }
});

describe("createActivityLog", () => {
  it("recording an event persists it so list() returns it", async () => {
    const log = memoryLog();
    const recorded = log.record({ kind: "summary", title: "Page summarized", detail: "SIH Results" });
    expect(recorded.id).toMatch(/^ev_/);
    expect(typeof recorded.at).toBe("number");

    const events = await log.list();
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(recorded);
  });

  it("list() filters by since and honours limit in chronological order", async () => {
    const log = memoryLog();
    log.record({ kind: "action", title: "first", at: 1000 });
    log.record({ kind: "action", title: "second", at: 2000 });
    log.record({ kind: "action", title: "third", at: 3000 });

    const since = await log.list({ since: 2000 });
    expect(since.map((event) => event.title)).toEqual(["second", "third"]);

    const limited = await log.list({ limit: 2 });
    expect(limited.map((event) => event.title)).toEqual(["first", "second"]);

    const both = await log.list({ since: 2000, limit: 1 });
    expect(both.map((event) => event.title)).toEqual(["second"]);
  });

  it("redacts a locked value to a token before writing", async () => {
    const secret = "1234-5678-9012";
    const log = memoryLog({ aadhaar: secret });
    const recorded = log.record({
      kind: "filled_form",
      title: `Filled form with ${secret}`,
      meta: { aadhaar: secret },
    });
    expect(recorded.title).toBe("Filled form with {{LOCKED:aadhaar}}");
    expect(recorded.meta).toEqual({ aadhaar: "{{LOCKED:aadhaar}}" });

    const events = await log.list();
    expect(JSON.stringify(events)).not.toContain(secret);
  });

  it("onRecord notifies subscribers until unsubscribed", async () => {
    const log = memoryLog();
    const seen: string[] = [];
    const unsubscribe = log.onRecord((event) => {
      seen.push(event.title);
    });
    log.record({ kind: "voice", title: "hello" });
    unsubscribe();
    log.record({ kind: "voice", title: "after" });
    expect(seen).toEqual(["hello"]);
    expect(await log.list()).toHaveLength(2);
  });

  it("never mutates history through returned copies", async () => {
    const log = memoryLog();
    const recorded = log.record({ kind: "action", title: "original", meta: { a: "b" } });
    recorded.title = "mutated";
    recorded.meta = { a: "mutated" };
    const events = await log.list();
    expect(events[0]?.title).toBe("original");
    expect(events[0]?.meta).toEqual({ a: "b" });
  });

  it("survives an IndexedDB round-trip across instances", async () => {
    const name = dbName();
    const writer = createActivityLog({ dbName: name });
    open.push(writer);
    await writer.ready;
    writer.record({ kind: "monitored", title: "watch hit", at: 5000 });
    writer.record({ kind: "alert", title: "deadline near", at: 6000 });
    await writer.flush();

    const reader = createActivityLog({ dbName: name });
    open.push(reader);
    const events = await reader.list();
    expect(events.map((event) => event.title)).toEqual(["watch hit", "deadline near"]);
  });
});
