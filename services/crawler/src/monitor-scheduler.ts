/**
 * Server-side monitor scheduler.
 *
 * The extension drives watches with `chrome.alarms`; the crawler service hosts
 * the always-on scheduler. It builds a `@diggy/monitor` engine whose source is
 * this same crawler service (`POST /extract` + `GET /feed`), persists watches
 * to `~/.diggy/monitor-watches.json`, and ticks on an interval.
 *
 * Enabled with `DIGGY_MONITOR_SCHEDULER=1` (see `main.ts`); the module keeps a
 * single handle so `GET /monitor` can report status.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  WatchStore,
  createCoreAnalyzer,
  createCrawlerSource,
  createMonitorEngine,
  createMonitorScheduler,
  createNoopAvatarAlerter,
  type MonitorEngine,
  type MonitorScheduler,
  type MonitorEvent,
  type Notifier,
  type WatchPersistence,
  type WatchRecord,
} from "@diggy/monitor";
import { diggyHomeDir } from "./service-auth.js";

/** Absolute path of the server-side watch store. */
export function monitorStorePath(): string {
  return join(diggyHomeDir(), "monitor-watches.json");
}

/** JSON-file persistence for server-side watches. */
export class FileWatchPersistence implements WatchPersistence {
  constructor(private readonly path: string = monitorStorePath()) {}

  async load(): Promise<WatchRecord[]> {
    try {
      const raw = readFileSync(this.path, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as WatchRecord[]) : [];
    } catch {
      return [];
    }
  }

  async save(records: WatchRecord[]): Promise<void> {
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    writeFileSync(this.path, `${JSON.stringify(records, null, 2)}\n`, "utf8");
  }
}

/** Notifier that logs events (the server has no OS notification surface). */
function createLogNotifier(log: (message: string) => void): Notifier {
  return {
    notify(event: MonitorEvent): void {
      log(`[monitor] ${event.severity.toUpperCase()} ${event.title} — ${event.summary}`);
    },
  };
}

/** Options for {@link startMonitorScheduler}. */
export interface StartMonitorSchedulerOptions {
  /** Crawler service port (the engine calls back into this service). */
  port: number;
  token?: string;
  tickMs?: number;
  /** Watch store path (default {@link monitorStorePath}). */
  storePath?: string;
  now?: () => number;
  log?: (message: string) => void;
}

/** Handle returned by {@link startMonitorScheduler}. */
export interface MonitorSchedulerHandle {
  engine: MonitorEngine;
  scheduler: MonitorScheduler;
  stop(): void;
}

let handle: { handle: MonitorSchedulerHandle; port: number } | undefined;

/** Start the singleton server-side scheduler (idempotent). */
export function startMonitorScheduler(
  options: StartMonitorSchedulerOptions,
): MonitorSchedulerHandle {
  if (handle) return handle.handle;

  const baseUrl = `http://127.0.0.1:${options.port}`;
  const store = new WatchStore(new FileWatchPersistence(options.storePath ?? monitorStorePath()));
  const engine = createMonitorEngine({
    source: createCrawlerSource({
      baseUrl,
      ...(options.token !== undefined ? { token: options.token } : {}),
    }),
    store,
    analyzer: createCoreAnalyzer(),
    notifier: createLogNotifier(options.log ?? ((message) => console.log(message))),
    avatar: createNoopAvatarAlerter(),
    ...(options.now !== undefined ? { now: options.now } : {}),
  });
  const scheduler = createMonitorScheduler({
    engine,
    tickMs: options.tickMs ?? 60_000,
    ...(options.now !== undefined ? { now: options.now } : {}),
  });
  scheduler.start();

  const created: MonitorSchedulerHandle = {
    engine,
    scheduler,
    stop: () => {
      scheduler.stop();
      if (handle?.handle === created) handle = undefined;
    },
  };
  handle = { handle: created, port: options.port };
  return created;
}

/** Stop the singleton scheduler, if running. */
export function stopMonitorScheduler(): void {
  handle?.handle.stop();
  handle = undefined;
}

/** Whether the scheduler file exists (informational). */
export function monitorStoreExists(): boolean {
  return existsSync(monitorStorePath());
}

/** Status for `GET /health` and `GET /monitor`. */
export async function monitorStatus(): Promise<{
  running: boolean;
  watchCount: number;
  port: number | null;
}> {
  if (!handle) return { running: false, watchCount: 0, port: null };
  const watches = await handle.handle.engine.list();
  return { running: handle.handle.scheduler.running, watchCount: watches.length, port: handle.port };
}
