/**
 * Schedulers — drive {@link MonitorEngine.check} on a cadence.
 *
 * One engine, two hosts:
 *  - the **Mozilla/Chrome extension** uses {@link installAlarmsScheduler}
 *    (MV3 `chrome.alarms`, because a service worker is evicted and a bare
 *    `setInterval` would stop);
 *  - the **server-side scheduler** in `@diggy/crawler` uses
 *    {@link createMonitorScheduler} + a `setInterval` loop.
 *
 * The due-ness decision lives in the engine (`due(now)`), so a missed tick
 * simply catches up on the next one — no double-checks, no drift.
 */
import type { MonitorEvent, WatchSpec } from "@diggy/shared";

/** The slice of the engine a scheduler needs. */
export interface SchedulableEngine {
  list(): Promise<WatchSpec[]>;
  check(id: string): Promise<MonitorEvent[]>;
  /** Watches whose polling interval has elapsed since their last check. */
  due(now: number): Promise<WatchSpec[]>;
}

/** Drives periodic checks. */
export interface MonitorScheduler {
  /** Run every due watch once; returns the events emitted this tick. */
  tick(now?: number): Promise<MonitorEvent[]>;
  /** Start the periodic loop (no-op if already running). */
  start(): void;
  /** Stop the periodic loop. */
  stop(): void;
  /** Whether the loop is currently running. */
  readonly running: boolean;
}

/** Options for {@link createMonitorScheduler}. */
export interface MonitorSchedulerOptions {
  engine: SchedulableEngine;
  /** How often to look for due watches, in ms (default 30_000). */
  tickMs?: number;
  now?: () => number;
  /** Called for a failed check (a single failure must not stop the loop). */
  onError?: (error: unknown, watchId?: string) => void;
}

/**
 * Interval-based scheduler. `tick()` is re-entrancy safe: a slow tick is not
 * overlapped by the next interval.
 */
export function createMonitorScheduler(options: MonitorSchedulerOptions): MonitorScheduler {
  const now = options.now ?? (() => Date.now());
  const tickMs = Math.max(1_000, options.tickMs ?? 30_000);
  let timer: ReturnType<typeof setInterval> | undefined;
  let inFlight = false;

  async function tick(at: number = now()): Promise<MonitorEvent[]> {
    if (inFlight) return [];
    inFlight = true;
    const events: MonitorEvent[] = [];
    try {
      const due = await options.engine.due(at);
      for (const spec of due) {
        try {
          events.push(...(await options.engine.check(spec.id)));
        } catch (error) {
          options.onError?.(error, spec.id);
        }
      }
    } catch (error) {
      options.onError?.(error);
    } finally {
      inFlight = false;
    }
    return events;
  }

  return {
    tick,
    start(): void {
      if (timer) return;
      timer = setInterval(() => {
        void tick();
      }, tickMs);
      // Do not keep a Node process alive purely for the monitor loop.
      if (typeof timer === "object" && timer && "unref" in timer) {
        (timer as { unref?: () => void }).unref?.();
      }
    },
    stop(): void {
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
    },
    get running(): boolean {
      return timer !== undefined;
    },
  };
}

/** The slice of `chrome.alarms` the extension scheduler needs. */
export interface ChromeAlarmsLike {
  create(name: string, info: { periodInMinutes?: number; delayInMinutes?: number }): void;
  clear(name: string): boolean;
  onAlarm: { addListener(callback: (alarm: { name: string }) => void): void };
}

/** Default alarm name (prefix identifies monitor alarms). */
export const MONITOR_ALARM = "diggy:monitor-tick";

/** Options for {@link installAlarmsScheduler}. */
export interface AlarmsSchedulerOptions extends MonitorSchedulerOptions {
  /** Alarm name (default {@link MONITOR_ALARM}). */
  alarmName?: string;
  /** Period in minutes (default 1 — `chrome.alarms` minimum). */
  periodInMinutes?: number;
}

/**
 * Install a `chrome.alarms`-driven scheduler. Returns the underlying scheduler
 * plus a `handleAlarm` for the background worker to forward alarms to (or let
 * `install()` register the listener for you).
 */
export function installAlarmsScheduler(
  alarms: ChromeAlarmsLike,
  options: AlarmsSchedulerOptions,
): { scheduler: MonitorScheduler; install: () => void } {
  const scheduler = createMonitorScheduler(options);
  const name = options.alarmName ?? MONITOR_ALARM;
  const periodInMinutes = Math.max(1, options.periodInMinutes ?? 1);

  return {
    scheduler,
    install(): void {
      alarms.create(name, { periodInMinutes });
      alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === name) void scheduler.tick();
      });
    },
  };
}
