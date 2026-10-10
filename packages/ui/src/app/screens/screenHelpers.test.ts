/**
 * Wave-8 screen helpers: Monitor tab grouping filters the real watches,
 * Actions menu items resolve to the real `ask` intent, and the Activity
 * range selector actually narrows the timeline.
 */
import { describe, expect, it } from "vitest";

import type { WatchRow } from "../sampleData.js";
import {
  ACTIVITY_RANGES,
  actionMenuItems,
  filterEventsByRange,
  filterWatches,
  watchGroup,
} from "./screenHelpers.js";

function watch(id: string, url: string, kind: WatchRow["spec"]["kind"] = "content_change"): WatchRow {
  return {
    spec: { id, url, kind, intervalSec: 900, createdAt: 0 },
    name: id,
    tags: [],
    active: true,
  };
}

describe("watchGroup", () => {
  it("puts plain sites under websites", () => {
    expect(watchGroup(watch("a", "https://example.com/page"))).toBe("websites");
  });

  it("puts github.com hosts and release watches under github", () => {
    expect(watchGroup(watch("b", "https://github.com/acme/app"))).toBe("github");
    expect(watchGroup(watch("c", "https://example.com/feed", "release_published"))).toBe("github");
  });

  it("puts non-page targets under others", () => {
    expect(watchGroup(watch("d", "not a url"))).toBe("others");
  });
});

describe("filterWatches", () => {
  const watches = [
    watch("site", "https://example.com"),
    watch("repo", "https://github.com/acme/app"),
    watch("odd", "not a url"),
  ];

  it("filters the real watches by tab instead of returning []", () => {
    expect(filterWatches(watches, "websites").map((row) => row.spec.id)).toEqual(["site"]);
    expect(filterWatches(watches, "github").map((row) => row.spec.id)).toEqual(["repo"]);
    expect(filterWatches(watches, "others").map((row) => row.spec.id)).toEqual(["odd"]);
  });
});

describe("actionMenuItems", () => {
  it("names a status-appropriate primary plus details", () => {
    expect(actionMenuItems("failed", "Fill form").map((item) => item.label)).toEqual([
      "Retry",
      "Details",
    ]);
    expect(actionMenuItems("scheduled", "Fill form").map((item) => item.label)).toEqual([
      "Run now",
      "Details",
    ]);
    expect(actionMenuItems("completed", "Fill form").map((item) => item.label)).toEqual([
      "Repeat",
      "Details",
    ]);
  });

  it("carries the row title in the goal text", () => {
    for (const item of actionMenuItems("failed", "Fill form")) {
      expect(item.text).toContain("Fill form");
    }
  });
});

describe("filterEventsByRange", () => {
  const NOW = 1_700_000_000_000;
  const events = [
    { id: "hour", at: NOW - 3_600_000 },
    { id: "week", at: NOW - 3 * 86_400_000 },
    { id: "old", at: NOW - 60 * 86_400_000 },
  ];

  it("narrows the timeline per range", () => {
    expect(filterEventsByRange(events, "today", NOW).map((event) => event.id)).toEqual(["hour"]);
    expect(filterEventsByRange(events, "week", NOW).map((event) => event.id)).toEqual([
      "hour",
      "week",
    ]);
    expect(filterEventsByRange(events, "month", NOW).map((event) => event.id)).toEqual([
      "hour",
      "week",
    ]);
    expect(filterEventsByRange(events, "all", NOW)).toHaveLength(3);
  });

  it("exposes the four ranges the Menu offers", () => {
    expect(ACTIVITY_RANGES.map((range) => range.id)).toEqual(["today", "week", "month", "all"]);
  });
});
