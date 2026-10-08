import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createWatchState } from "@diggy/monitor";
import {
  FileWatchPersistence,
  monitorStatus,
  startMonitorScheduler,
  stopMonitorScheduler,
} from "../src/monitor-scheduler.js";

const files: string[] = [];

function tempPath(): string {
  const path = join(tmpdir(), `diggy-monitor-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  files.push(path);
  return path;
}

afterEach(async () => {
  stopMonitorScheduler();
  for (const file of files.splice(0)) {
    await rm(file, { force: true }).catch(() => undefined);
  }
});

describe("FileWatchPersistence", () => {
  it("round-trips records and tolerates a missing file", async () => {
    const path = tempPath();
    const persistence = new FileWatchPersistence(path);

    expect(await persistence.load()).toEqual([]);

    const record = {
      spec: { id: "w1", url: "https://example.com", kind: "content_change" as const, intervalSec: 60, createdAt: 0 },
      state: { ...createWatchState(), baseline: true, lastCheckedAt: 42 },
    };
    await persistence.save([record]);

    const reloaded = await new FileWatchPersistence(path).load();
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0]?.spec.id).toBe("w1");
    expect(reloaded[0]?.state.lastCheckedAt).toBe(42);
  });
});

describe("monitorStatus", () => {
  it("reports not running before the scheduler starts", async () => {
    expect(await monitorStatus()).toEqual({ running: false, watchCount: 0, port: null });
  });

  it("starts and stops the singleton scheduler", async () => {
    const handle = startMonitorScheduler({ port: 17322, storePath: tempPath(), tickMs: 3_600_000 });
    expect(handle.scheduler.running).toBe(true);
    const status = await monitorStatus();
    expect(status.running).toBe(true);
    expect(status.port).toBe(17322);

    // Idempotent: the second call returns the same handle.
    expect(startMonitorScheduler({ port: 9999 })).toBe(handle);

    handle.stop();
    expect((await monitorStatus()).running).toBe(false);
  });
});
