// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act, useEffect } from "react";

import {
  MAX_NOTIFICATIONS,
  useNotifications,
  type NotificationInput,
  type UseNotificationsResult,
} from "./useNotifications.js";

const flusher = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };

let container: HTMLDivElement;
let root: Root;
let latest: UseNotificationsResult | null = null;

function Probe() {
  const result = useNotifications();
  useEffect(() => {
    latest = result;
  });
  latest = result;
  return null;
}

function setup() {
  flusher.IS_REACT_ACT_ENVIRONMENT = true;
  latest = null;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<Probe />));
  if (!latest) throw new Error("hook probe did not render");
}

function teardown() {
  act(() => root.unmount());
  container.remove();
  latest = null;
  flusher.IS_REACT_ACT_ENVIRONMENT = false;
}

function current(): UseNotificationsResult {
  if (!latest) throw new Error("hook result missing");
  return latest;
}

const reminder: NotificationInput = { kind: "reminder", title: "Stand up and stretch" };
const alert: NotificationInput = { kind: "alert", title: "Price dropped", detail: "Now $41" };

describe("useNotifications", () => {
  it("counts unread and lists newest first", () => {
    setup();
    try {
      act(() => current().push(reminder));
      act(() => current().push(alert));
      expect(current().items).toHaveLength(2);
      expect(current().items[0]?.title).toBe("Price dropped");
      expect(current().unread).toBe(2);
    } finally {
      teardown();
    }
  });

  it("marks a single notification read", () => {
    setup();
    try {
      act(() => current().push(reminder));
      act(() => current().push(alert));
      const firstId = current().items[0]?.id;
      if (!firstId) throw new Error("no notification pushed");
      act(() => current().markRead(firstId));
      expect(current().unread).toBe(1);
      expect(current().items[0]?.read).toBe(true);
      expect(current().items[1]?.read).toBe(false);
    } finally {
      teardown();
    }
  });

  it("marks all read and clears the list", () => {
    setup();
    try {
      act(() => current().push(reminder));
      act(() => current().push(alert));
      act(() => current().markAllRead());
      expect(current().unread).toBe(0);
      act(() => current().clear());
      expect(current().items).toEqual([]);
      expect(current().unread).toBe(0);
    } finally {
      teardown();
    }
  });

  it("caps the list at MAX_NOTIFICATIONS, newest first", () => {
    setup();
    try {
      act(() => {
        for (let index = 0; index < MAX_NOTIFICATIONS + 5; index += 1) {
          current().push({ kind: "alert", title: `Alert ${index}` });
        }
      });
      expect(current().items).toHaveLength(MAX_NOTIFICATIONS);
      expect(current().items[0]?.title).toBe(`Alert ${MAX_NOTIFICATIONS + 4}`);
      expect(current().unread).toBe(MAX_NOTIFICATIONS);
    } finally {
      teardown();
    }
  });
});
