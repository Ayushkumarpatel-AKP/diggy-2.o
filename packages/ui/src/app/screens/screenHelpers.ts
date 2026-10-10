/**
 * Wave-8 screen helpers — pure functions with no component imports, so they
 * are unit-testable without a DOM and without the w8-parts primitives.
 *
 * // INTERFACE FOR INTEGRATION
 * type MonitorGroup = "websites" | "github" | "others";
 * function watchGroup(watch: WatchRow): MonitorGroup;
 * function filterWatches(watches: readonly WatchRow[], tab: string): WatchRow[];
 * interface ActionMenuItem { id: string; label: string; text: string }
 * function actionMenuItems(status: ActionStatus, title: string): ActionMenuItem[];
 * interface ActivityRange { id: string; label: string; days: number | null }
 * const ACTIVITY_RANGES: readonly ActivityRange[];
 * function filterEventsByRange<E extends { at: number }>(
 *   events: readonly E[], rangeId: string, now?: number): E[];
 * // END INTERFACE FOR INTEGRATION
 */
import type { ActionStatus, WatchRow } from "../sampleData.js";

export type MonitorGroup = "websites" | "github" | "others";

/**
 * Which Monitor tab a watch belongs to. GitHub watches are release
 * notifications or anything hosted on github.com; anything that is not an
 * http(s) page falls under Others; the rest are Websites.
 */
export function watchGroup(watch: WatchRow): MonitorGroup {
  let host = "";
  try {
    host = new URL(watch.spec.url).host.toLowerCase();
  } catch {
    return "others";
  }
  if (
    host === "github.com" ||
    host.endsWith(".github.com") ||
    host.endsWith(".github.io") ||
    watch.spec.kind === "release_published"
  ) {
    return "github";
  }
  if (!watch.spec.url.startsWith("http://") && !watch.spec.url.startsWith("https://")) {
    return "others";
  }
  return "websites";
}

/** The Monitor tabs filter the real watches by group — never a hard-coded `[]`. */
export function filterWatches(watches: readonly WatchRow[], tab: string): WatchRow[] {
  if (tab === "github" || tab === "others" || tab === "websites") {
    return watches.filter((watch) => watchGroup(watch) === tab);
  }
  return [...watches];
}

export interface ActionMenuItem {
  id: string;
  label: string;
  /** Goal text sent as `onCommand(text, "ask")` when the item is chosen. */
  text: string;
}

/**
 * Per-row Actions menu, by row status. Every item resolves to the real `ask`
 * intent — there is no dedicated action verb on the runtime, so the row title
 * plus a verb travels as the goal text.
 */
export function actionMenuItems(status: ActionStatus, title: string): ActionMenuItem[] {
  const primary: ActionMenuItem =
    status === "failed"
      ? { id: "retry", label: "Retry", text: `Retry: ${title}` }
      : status === "scheduled"
        ? { id: "run", label: "Run now", text: `Run now: ${title}` }
        : { id: "repeat", label: "Repeat", text: `Repeat: ${title}` };
  return [primary, { id: "details", label: "Details", text: `What happened here: ${title}` }];
}

export interface ActivityRange {
  id: string;
  label: string;
  /** Rolling window in days; `null` keeps everything. */
  days: number | null;
}

export const ACTIVITY_RANGES: readonly ActivityRange[] = [
  { id: "today", label: "Today", days: 1 },
  { id: "week", label: "Last 7 days", days: 7 },
  { id: "month", label: "Last 30 days", days: 30 },
  { id: "all", label: "All time", days: null },
];

/** Roll the activity timeline back to the chosen range window. */
export function filterEventsByRange<E extends { at: number }>(
  events: readonly E[],
  rangeId: string,
  now: number = Date.now(),
): E[] {
  const range = ACTIVITY_RANGES.find((entry) => entry.id === rangeId) ?? ACTIVITY_RANGES[0];
  if (!range || range.days === null) return [...events];
  const cutoff = now - range.days * 86_400_000;
  return events.filter((event) => event.at >= cutoff);
}
