// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

import type { AppNotification } from "../hooks/useNotifications.js";
import { NotificationPanel } from "./NotificationPanel.js";

const flusher = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };

let container: HTMLDivElement;
let root: Root;

function setup() {
  flusher.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
}

function teardown() {
  act(() => root.unmount());
  container.remove();
  flusher.IS_REACT_ACT_ENVIRONMENT = false;
}

function notification(partial: Partial<AppNotification> & { title: string }): AppNotification {
  return {
    id: `n_${partial.title}`,
    kind: "alert",
    at: Date.now(),
    read: false,
    ...partial,
  };
}

describe("NotificationPanel", () => {
  it("renders an empty state that explains what will appear", () => {
    setup();
    try {
      act(() => root.render(<NotificationPanel items={[]} />));
      const text = container.textContent ?? "";
      expect(text).toContain("No notifications yet");
      expect(text).toContain("Reminders");
    } finally {
      teardown();
    }
  });

  it("groups rows by recency with relative times and unread dots", () => {
    setup();
    try {
      const now = Date.now();
      const items: AppNotification[] = [
        notification({ title: "Just now", kind: "reminder", at: now - 5 * 60_000 }),
        notification({ title: "This morning", kind: "approval", at: now - 3 * 3_600_000 }),
        notification({ title: "Last week", kind: "error", at: now - 3 * 86_400_000 }),
      ];
      act(() => root.render(<NotificationPanel items={items} />));
      const text = container.textContent ?? "";
      expect(text).toContain("Recent");
      expect(text).toContain("Earlier today");
      expect(text).toContain("Older");
      expect(text).toContain("min ago");
      expect(container.querySelectorAll('[aria-label="Unread"]')).toHaveLength(3);
    } finally {
      teardown();
    }
  });

  it("marks rows read via per-row and mark-all controls", () => {
    setup();
    try {
      const onMarkRead = vi.fn();
      const onMarkAllRead = vi.fn();
      const items: AppNotification[] = [
        notification({ title: "One" }),
        notification({ title: "Two", read: true }),
      ];
      act(() =>
        root.render(
          <NotificationPanel items={items} onMarkRead={onMarkRead} onMarkAllRead={onMarkAllRead} />,
        ),
      );
      // Only the unread row offers a per-row control.
      const rowButtons = Array.from(container.querySelectorAll("button")).filter((button) =>
        button.textContent?.includes("Mark read"),
      );
      expect(rowButtons).toHaveLength(1);
      const first = rowButtons[0];
      if (!first) throw new Error("per-row mark-read button missing");
      act(() => first.click());
      expect(onMarkRead).toHaveBeenCalledWith("n_One");

      const all = Array.from(container.querySelectorAll("button")).find((button) =>
        button.textContent?.includes("Mark all read"),
      );
      expect(all).toBeTruthy();
      act(() => all?.click());
      expect(onMarkAllRead).toHaveBeenCalledTimes(1);
    } finally {
      teardown();
    }
  });

  it("renders no mark-read controls without handlers", () => {
    setup();
    try {
      act(() => root.render(<NotificationPanel items={[notification({ title: "Solo" })]} />));
      expect(container.querySelectorAll("button")).toHaveLength(0);
    } finally {
      teardown();
    }
  });
});
