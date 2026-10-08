import { describe, expect, it } from "vitest";
import type { MonitorEvent, WatchSpec } from "@diggy/shared";
import {
  MONITOR_ALARM,
  createMonitorScheduler,
  installAlarmsScheduler,
  type ChromeAlarmsLike,
  type SchedulableEngine,
} from "./scheduler.js";

function spec(id: string): WatchSpec {
  return { id, url: `https://example.com/${id}`, kind: "content_change", intervalSec: 60, createdAt: 0 };
}

function event(watchId: string): MonitorEvent {
  return {
    id: `e-${watchId}`,
    watchId,
    url: `https://example.com/${watchId}`,
    kind: "content_change",
    eventKey: `k-${watchId}`,
    title: "t",
    summary: "s",
    evidence: "e",
    detectedAt: 0,
    severity: "low",
  };
}

function fakeEngine(due: WatchSpec[]): SchedulableEngine & { checked: string[] } {
  const checked: string[] = [];
  return {
    checked,
    async list() {
      return due;
    },
    async due() {
      return due;
    },
    async check(id: string) {
      checked.push(id);
      return [event(id)];
    },
  };
}

describe("createMonitorScheduler", () => {
  it("ticks only due watches and collects their events", async () => {
    const engine = fakeEngine([spec("a"), spec("b")]);
    const scheduler = createMonitorScheduler({ engine, now: () => 1_000 });
    const events = await scheduler.tick();
    expect(engine.checked).toEqual(["a", "b"]);
    expect(events.map((e) => e.watchId)).toEqual(["a", "b"]);
  });

  it("isolates a failing check via onError", async () => {
    const errors: unknown[] = [];
    const engine: SchedulableEngine = {
      async list() {
        return [spec("bad")];
      },
      async due() {
        return [spec("bad")];
      },
      async check() {
        throw new Error("boom");
      },
    };
    const scheduler = createMonitorScheduler({ engine, onError: (error) => errors.push(error) });
    expect(await scheduler.tick()).toEqual([]);
    expect(errors).toHaveLength(1);
  });

  it("start/stop toggle `running`", () => {
    const scheduler = createMonitorScheduler({ engine: fakeEngine([]), tickMs: 60_000 });
    expect(scheduler.running).toBe(false);
    scheduler.start();
    expect(scheduler.running).toBe(true);
    scheduler.stop();
    expect(scheduler.running).toBe(false);
  });
});

describe("installAlarmsScheduler", () => {
  it("creates the alarm and forwards matching alarms to tick", async () => {
    const created: { name: string; periodInMinutes?: number }[] = [];
    let listener: ((alarm: { name: string }) => void) | undefined;
    const alarms: ChromeAlarmsLike = {
      create(name, info) {
        created.push({ name, ...info });
      },
      clear() {
        return true;
      },
      onAlarm: {
        addListener(cb) {
          listener = cb;
        },
      },
    };

    const engine = fakeEngine([spec("a")]);
    const { scheduler, install } = installAlarmsScheduler(alarms, { engine, periodInMinutes: 2 });
    install();

    expect(created).toEqual([{ name: MONITOR_ALARM, periodInMinutes: 2 }]);
    expect(typeof listener).toBe("function");

    // A matching alarm drives a tick; an unrelated one is ignored.
    listener?.({ name: MONITOR_ALARM });
    listener?.({ name: "other" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(engine.checked).toEqual(["a"]);
    expect(scheduler.running).toBe(false);
  });
});
