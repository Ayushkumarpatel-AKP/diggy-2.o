import { describe, expect, it } from "vitest";
import type { MonitorKind, WatchSpec } from "@diggy/shared";
import {
  MAX_WATCHES,
  MemoryWatchPersistence,
  WatchStore,
  createWatchState,
  evaluateWatch,
  hashText,
  makeEventKey,
  type PageSnapshot,
  type WatchState,
} from "./watches.js";

function mkSpec(kind: MonitorKind, extra: Partial<WatchSpec> = {}): WatchSpec {
  return {
    id: "watch-1",
    url: "https://example.com/page",
    kind,
    intervalSec: 60,
    createdAt: 0,
    ...extra,
  };
}

function snap(text: string, extra: Partial<PageSnapshot> = {}): PageSnapshot {
  return { url: "https://example.com/page", title: "Page", text, ...extra };
}

/** Run baseline then a sequence of snapshots; collect detections. */
function run(spec: WatchSpec, snapshots: PageSnapshot[]) {
  let state: WatchState = createWatchState();
  const detections = [];
  let first = true;
  for (const s of snapshots) {
    const result = evaluateWatch(spec, state, s, first ? 1 : 2);
    state = result.state;
    if (result.detection) detections.push(result.detection);
    first = false;
  }
  return { detections, state };
}

describe("hashText", () => {
  it("is deterministic and content-sensitive", () => {
    expect(hashText("hello")).toBe(hashText("hello"));
    expect(hashText("hello")).not.toBe(hashText("hello!"));
    expect(hashText("")).toHaveLength(16);
  });
});

describe("content_change detection", () => {
  it("baselines then detects a change, deduping identical content", () => {
    const { detections } = run(mkSpec("content_change"), [snap("A"), snap("B"), snap("B")]);
    expect(detections).toHaveLength(1);
    expect(detections[0]!.eventKey).toBe(makeEventKey("watch-1", "content", hashText("B")));
  });

  it("ignores whitespace-only differences", () => {
    const { detections } = run(mkSpec("content_change"), [snap("A   B"), snap("A B"), snap("A\nB")]);
    expect(detections).toHaveLength(0);
  });
});

describe("keyword detection", () => {
  it("fires on the absent→present transition and re-arms with keep", () => {
    const spec = mkSpec("keyword", { query: "selected", keep: true });
    const { detections } = run(spec, [
      snap("nothing here"),
      snap("you are selected"),
      snap("you are selected"),
      snap("nothing here"),
      snap("now selected again"),
    ]);
    expect(detections).toHaveLength(2);
    expect(detections[0]!.summary).toContain("selected");
  });

  it("does not fire when the keyword is present at baseline", () => {
    const spec = mkSpec("keyword", { query: "open" });
    const { detections } = run(spec, [snap("registration open"), snap("registration open")]);
    expect(detections).toHaveLength(0);
  });
});

describe("price_change detection", () => {
  it("fires when the price changes and dedupes the new price", () => {
    const spec = mkSpec("price_change", { keep: true });
    const { detections } = run(spec, [
      snap("price", { price: 100 }),
      snap("price", { price: 90 }),
      snap("price", { price: 90 }),
      snap("price", { price: 80 }),
    ]);
    expect(detections.map((d) => d.eventKey)).toEqual([
      makeEventKey("watch-1", "price", 90),
      makeEventKey("watch-1", "price", 80),
    ]);
  });
});

describe("new_post detection", () => {
  it("fires for a post id that was not in the baseline", () => {
    const spec = mkSpec("new_post");
    const { detections } = run(spec, [
      snap("feed", { posts: [{ id: "a", title: "A", url: "https://e/a" }] }),
      snap("feed", {
        posts: [
          { id: "b", title: "B", url: "https://e/b" },
          { id: "a", title: "A", url: "https://e/a" },
        ],
      }),
      snap("feed", {
        posts: [
          { id: "b", title: "B", url: "https://e/b" },
          { id: "a", title: "A", url: "https://e/a" },
        ],
      }),
    ]);
    expect(detections).toHaveLength(1);
    expect(detections[0]!.eventKey).toBe(makeEventKey("watch-1", "post", "b"));
  });
});

describe("registration / deadline / release detection", () => {
  it("registration_open fires with critical severity", () => {
    const spec = mkSpec("registration_open");
    const { detections } = run(spec, [
      snap("closed", { registrationOpen: false }),
      snap("apply now", { registrationOpen: true }),
    ]);
    expect(detections).toHaveLength(1);
    expect(detections[0]!.severity).toBe("critical");
    expect(detections[0]!.eventKey).toBe(makeEventKey("watch-1", "registration", "open"));
  });

  it("deadline_change fires on a new deadline", () => {
    const spec = mkSpec("deadline_change");
    const { detections } = run(spec, [
      snap("x", { deadline: "2026-01-01" }),
      snap("y", { deadline: "2026-02-01" }),
    ]);
    expect(detections[0]!.eventKey).toBe(makeEventKey("watch-1", "deadline", "2026-02-01"));
  });

  it("release_published fires on a new version", () => {
    const spec = mkSpec("release_published");
    const { detections } = run(spec, [
      snap("v1", { version: "1.0.0" }),
      snap("v2", { version: "1.1.0" }),
    ]);
    expect(detections[0]!.eventKey).toBe(makeEventKey("watch-1", "release", "1.1.0"));
  });
});

describe("custom detection", () => {
  it("matches a regex rule and dedupes identical matches", () => {
    const spec = mkSpec("custom", { query: "Result:\\s*(\\w+)" });
    const { detections } = run(spec, [snap("nothing"), snap("Result: PASS"), snap("Result: PASS")]);
    expect(detections).toHaveLength(1);
    expect(detections[0]!.evidence).toContain("PASS");
  });
});

describe("WatchStore", () => {
  it("adds, lists, gets, removes and persists through the adapter", async () => {
    const persistence = new MemoryWatchPersistence();
    const store = new WatchStore(persistence);
    const spec = await store.add(
      { url: "https://example.com/a", kind: "content_change", intervalSec: 60 },
      { id: "watch-a", now: 10 },
    );
    expect(spec.id).toBe("watch-a");
    expect(spec.createdAt).toBe(10);
    expect((await store.list()).map((w) => w.id)).toEqual(["watch-a"]);
    expect((await store.get("watch-a"))?.state.baseline).toBe(false);

    await store.setState("watch-a", { ...createWatchState(), baseline: true, lastCheckedAt: 99 });
    expect((await store.get("watch-a"))?.state.baseline).toBe(true);

    // A fresh store over the same persistence sees the saved record.
    const reloaded = new WatchStore(persistence);
    expect((await reloaded.get("watch-a"))?.state.lastCheckedAt).toBe(99);

    await store.remove("watch-a");
    expect(await store.list()).toEqual([]);
  });

  it("enforces MAX_WATCHES", async () => {
    const store = new WatchStore();
    for (let i = 0; i < MAX_WATCHES; i += 1) {
      await store.add(
        { url: `https://example.com/${i}`, kind: "content_change", intervalSec: 60 },
        { id: `w-${i}`, now: i },
      );
    }
    await expect(
      store.add({ url: "https://example.com/over", kind: "content_change", intervalSec: 60 }, { id: "over", now: 0 }),
    ).rejects.toThrow(/at most/);
  });
});
