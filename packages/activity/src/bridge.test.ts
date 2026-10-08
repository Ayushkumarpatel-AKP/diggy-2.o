import { afterEach, describe, expect, it } from "vitest";
import { BusEvents, createBus, type MonitorEvent } from "@diggy/shared";

import { wireActivityBus } from "./bridge.js";
import { createActivityLog, type ActivityLog } from "./store.js";

const open: ActivityLog[] = [];

afterEach(async () => {
  while (open.length > 0) {
    const log = open.pop() as ActivityLog;
    await log.close();
  }
});

function setup(): { log: ActivityLog; stop: () => void; bus: ReturnType<typeof createBus> } {
  const bus = createBus({ source: "background" });
  const log = createActivityLog({ persistent: false });
  open.push(log);
  const stop = wireActivityBus(bus, log);
  return { log, stop, bus };
}

function monitorPayload(): MonitorEvent {
  return {
    id: "mon_1",
    watchId: "watch_sih",
    url: "https://sih.gov.in",
    kind: "content_change",
    eventKey: "sih-results-v2",
    title: "SIH results updated",
    summary: "Results page changed",
    evidence: "diff-1",
    detectedAt: 7000,
    severity: "high",
  };
}

describe("wireActivityBus", () => {
  it("routes monitor events into the log", async () => {
    const { log, bus } = setup();
    bus.emit(BusEvents.MonitorEvent, monitorPayload());
    const events = await log.list();
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe("monitored");
    expect(events[0]?.title).toBe("SIH results updated");
    expect(events[0]?.meta?.["watchId"]).toBe("watch_sih");
  });

  it("routes voice transcripts and form fills into the log", async () => {
    const { log, bus } = setup();
    bus.emit(BusEvents.VoiceTranscript, { text: "summarize this page" });
    bus.emit("form.filled", { title: "Filled 8 fields", detail: "Internship form", meta: { site: "x.com" } });
    const events = await log.list();
    expect(events.map((event) => event.kind)).toEqual(["voice", "filled_form"]);
    expect(events[0]?.detail).toBe("summarize this page");
  });

  it("routes action plans and integrations into the log", async () => {
    const { log, bus } = setup();
    bus.emit(BusEvents.PlanRequest, { goal: "book a ticket" });
    bus.emit("integration.event", { title: "Gmail: 1 important mail" });
    bus.emit(BusEvents.ActivityRecord, { kind: "opened_site", title: "Opened example.com" });
    const events = await log.list();
    expect(events.map((event) => event.kind)).toEqual(["action", "integration", "opened_site"]);
  });

  it("stops flowing after unsubscribe", async () => {
    const { log, bus, stop } = setup();
    stop();
    bus.emit(BusEvents.VoiceTranscript, { text: "ignored" });
    expect(await log.list()).toHaveLength(0);
  });
});
