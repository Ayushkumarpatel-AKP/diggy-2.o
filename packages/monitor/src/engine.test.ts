import { describe, expect, it } from "vitest";
import type { MonitorEvent } from "@diggy/shared";
import type { AnalysisRequest, AnalysisResult, Analyzer } from "./analyzer.js";
import { createMonitorEngine, type MonitorEngine } from "./engine.js";
import { createMemoryNotifier } from "./notify.js";
import type { AvatarAlerter } from "./avatar-alert.js";
import type { Source } from "./source.js";
import {
  hashText,
  makeEventKey,
  normalizeText,
  type PageSnapshot,
} from "./watches.js";

/** Source replaying a fixed sequence of page texts (last one repeats). */
function sequenceSource(texts: string[], url: string): Source & { calls: number } {
  let index = 0;
  return {
    calls: 0,
    async fetch(): Promise<PageSnapshot> {
      const text = texts[Math.min(index, texts.length - 1)] ?? "";
      index += 1;
      this.calls += 1;
      return { url, title: "Exam Portal", text };
    },
  };
}

function recordingAvatar(): AvatarAlerter & { alerts: MonitorEvent[] } {
  const alerts: MonitorEvent[] = [];
  return {
    alerts,
    alert(event: MonitorEvent): void {
      alerts.push(event);
    },
  };
}

function engineWith(source: Source): {
  engine: MonitorEngine;
  notified: MonitorEvent[];
  avatar: ReturnType<typeof recordingAvatar>;
} {
  const notifier = createMemoryNotifier();
  const avatar = recordingAvatar();
  let counter = 0;
  const engine = createMonitorEngine({
    source,
    notifier,
    avatar,
    now: () => 1_000,
    idFactory: () => `id-${(counter += 1)}`,
  });
  return { engine, notified: notifier.events, avatar };
}

describe("Monitor Engine acceptance — baseline → change → dedupe → keep", () => {
  it("baselines on the first check, fires exactly one event on change, dedupes, and keep re-arms", async () => {
    const url = "https://example.com/exam";
    const source = sequenceSource(
      ["Registration closed. Content A.", "Registration open! Content B.", "Registration open! Content B.", "Content C changed."],
      url,
    );
    const { engine, notified, avatar } = engineWith(source);

    const spec = await engine.add({ url, kind: "content_change", intervalSec: 60, keep: true });

    // 1) first check establishes the baseline — no event.
    const first = await engine.check(spec.id);
    expect(first).toHaveLength(0);

    // 2) changed content emits exactly one event.
    const second = await engine.check(spec.id);
    expect(second).toHaveLength(1);
    const event = second[0]!;
    expect(event.kind).toBe("content_change");
    expect(event.watchId).toBe(spec.id);
    expect(event.url).toBe(url);
    expect(event.eventKey).toBe(
      makeEventKey(spec.id, "content", hashText(normalizeText("Registration open! Content B."))),
    );

    // 3) an identical check emits nothing (dedupe by eventKey).
    const third = await engine.check(spec.id);
    expect(third).toHaveLength(0);

    // 4) `keep` re-arms: the next distinct change fires again.
    const fourth = await engine.check(spec.id);
    expect(fourth).toHaveLength(1);
    expect(fourth[0]!.eventKey).not.toBe(event.eventKey);

    // Delivery + avatar alert fired once per emitted event.
    expect(notified.map((e) => e.eventKey)).toEqual(second.concat(fourth).map((e) => e.eventKey));
    expect(avatar.alerts).toHaveLength(2);
  });

  it("a non-keep watch fires once then stays spent until re-armed", async () => {
    const url = "https://example.com/jobs";
    const source = sequenceSource(["A", "B", "C", "D", "E"], url);
    const { engine } = engineWith(source);
    const spec = await engine.add({ url, kind: "content_change", intervalSec: 30 });

    expect(await engine.check(spec.id)).toHaveLength(0); // baseline
    expect(await engine.check(spec.id)).toHaveLength(1); // B
    expect(await engine.check(spec.id)).toHaveLength(0); // C — spent
    expect(await engine.check(spec.id)).toHaveLength(0); // D — still spent

    await engine.rearm(spec.id);
    expect(await engine.check(spec.id)).toHaveLength(1); // E — re-armed, fires again
  });

  it("never emits the same eventKey twice across many checks", async () => {
    const url = "https://example.com/x";
    const source = sequenceSource(["one", "two", "one", "two", "one"], url);
    const { engine } = engineWith(source);
    const spec = await engine.add({ url, kind: "content_change", intervalSec: 60, keep: true });

    const seen: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      for (const event of await engine.check(spec.id)) seen.push(event.eventKey);
    }
    expect(new Set(seen).size).toBe(seen.length);
  });
});

describe("Monitor Engine wiring", () => {
  it("runs the injected analyzer and uses its title/summary/severity", async () => {
    const url = "https://example.com/a";
    const source = sequenceSource(["before", "after"], url);
    const requests: AnalysisRequest[] = [];
    const analyzer: Analyzer = {
      async analyze(request: AnalysisRequest): Promise<AnalysisResult> {
        requests.push(request);
        return { title: "Exam registration opened", summary: "Apply before the deadline.", severity: "critical", analyzedBy: "core" };
      },
    };
    const engine = createMonitorEngine({ source, analyzer, now: () => 5, idFactory: () => "n" });

    const spec = await engine.add({ url, kind: "content_change", intervalSec: 60 });
    await engine.check(spec.id);
    const [event] = await engine.check(spec.id);

    expect(requests).toHaveLength(1);
    expect(requests[0]!.before).toBe("before");
    expect(requests[0]!.after).toBe("after");
    expect(event?.title).toBe("Exam registration opened");
    expect(event?.summary).toBe("Apply before the deadline.");
    expect(event?.severity).toBe("critical");
  });

  it("notifies onChange subscribers and unsubscribes cleanly", async () => {
    const url = "https://example.com/b";
    const source = sequenceSource(["a", "b"], url);
    const { engine } = engineWith(source);
    const seen: MonitorEvent[] = [];
    const off = engine.onChange((event) => seen.push(event));

    const spec = await engine.add({ url, kind: "content_change", intervalSec: 60 });
    await engine.check(spec.id);
    await engine.check(spec.id);
    expect(seen).toHaveLength(1);

    off();
    await engine.check(spec.id);
    expect(seen).toHaveLength(1);
  });

  it("checkAll and due(now) respect intervals", async () => {
    const url = "https://example.com/c";
    const source = sequenceSource(["a", "b"], url);
    let clock = 1_000;
    const notifier = createMemoryNotifier();
    const engine = createMonitorEngine({ source, notifier, now: () => clock, idFactory: () => "d" });

    const spec = await engine.add({ url, kind: "content_change", intervalSec: 30 });

    // A fresh watch is due immediately.
    expect((await engine.due(clock)).map((w) => w.id)).toEqual([spec.id]);
    expect(await engine.checkAll()).toHaveLength(0); // baseline

    // Not due again until the interval elapses.
    expect(await engine.due(clock + 10_000)).toHaveLength(0);
    clock += 30_000;
    expect((await engine.due(clock)).map((w) => w.id)).toEqual([spec.id]);
    expect(await engine.checkAll()).toHaveLength(1); // changed
  });

  it("rejects invalid specs", async () => {
    const source = sequenceSource(["a"], "https://example.com/d");
    const { engine } = engineWith(source);
    await expect(engine.add({ url: "not-a-url", kind: "content_change", intervalSec: 60 })).rejects.toThrow();
    await expect(
      engine.add({ url: "https://example.com/d", kind: "content_change", intervalSec: 5 }),
    ).rejects.toThrow(/intervalSec/);
    await expect(
      engine.add({ url: "https://example.com/d", kind: "keyword", intervalSec: 60 }),
    ).rejects.toThrow(/query/);
  });
});
