// @vitest-environment jsdom
/**
 * Renders the real sidepanel Activity panel with a populated timeline and
 * exercises the Today / All time / date filters.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ActivityEvent } from "@diggy/shared";

import { ActivityPanel } from "../../../apps/extension/entrypoints/sidepanel/src/panels/ActivityPanel.js";

const flusher = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
const realError = console.error;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const DAY_MS = 86_400_000;
const NOW = Date.now();

function makeEvents(): ActivityEvent[] {
  return [
    { id: "ev_today", kind: "summary", title: "Page summarized today", detail: "SIH Results", at: NOW },
    {
      id: "ev_old",
      kind: "monitored",
      title: "Old monitor hit",
      detail: "Three days ago",
      at: NOW - 3 * DAY_MS,
    },
  ];
}

function render(events: ActivityEvent[]): void {
  act(() => {
    root?.render(<ActivityPanel events={events} />);
  });
}

function selectRange(value: string): void {
  const select = container?.querySelector('select[aria-label="Activity range"]') as HTMLSelectElement | null;
  expect(select).not.toBeNull();
  act(() => {
    select!.value = value;
    select!.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

beforeEach(() => {
  vi.useRealTimers();
  flusher.IS_REACT_ACT_ENVIRONMENT = true;
  console.error = vi.fn();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
  console.error = realError;
});

describe("ActivityPanel", () => {
  it("renders a populated timeline defaulting to Today", () => {
    render(makeEvents());
    const text = container?.textContent ?? "";
    expect(text).toContain("Page summarized today");
    expect(text).not.toContain("Old monitor hit");
    expect(console.error).not.toHaveBeenCalled();
  });

  it("shows every event under All time", () => {
    render(makeEvents());
    selectRange("all");
    const text = container?.textContent ?? "";
    expect(text).toContain("Page summarized today");
    expect(text).toContain("Old monitor hit");
  });

  it("renders an empty state when nothing matches the range", () => {
    render([]);
    expect(container?.textContent ?? "").toContain("No activity in this range yet");
  });
});
