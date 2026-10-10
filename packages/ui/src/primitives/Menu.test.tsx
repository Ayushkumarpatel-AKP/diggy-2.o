// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

import { Menu, type MenuItem } from "./Menu.js";

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

function items(onSelect: () => void): MenuItem[] {
  return [
    { id: "check", label: "Check now", onSelect },
    { id: "pause", label: "Pause", onSelect },
    { id: "remove", label: "Remove", onSelect, danger: true },
  ];
}

function trigger(): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>('button[aria-label="Watch options"]');
  if (!button) throw new Error("menu trigger not found");
  return button;
}

function menu(): HTMLElement | null {
  return container.querySelector('[role="menu"]');
}

function menuItems(): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
}

describe("Menu", () => {
  it("exposes menu semantics on the trigger", () => {
    setup();
    try {
      act(() => root.render(<Menu label="Watch options" items={items(() => undefined)} />));
      const button = trigger();
      expect(button.getAttribute("aria-haspopup")).toBe("menu");
      expect(button.getAttribute("aria-expanded")).toBe("false");
      act(() => button.click());
      expect(menu()).not.toBeNull();
      expect(button.getAttribute("aria-expanded")).toBe("true");
    } finally {
      teardown();
    }
  });

  it("closes on Escape and returns focus to the trigger", () => {
    setup();
    try {
      act(() => root.render(<Menu label="Watch options" items={items(() => undefined)} />));
      act(() => trigger().click());
      expect(menu()).not.toBeNull();
      act(() => {
        menu()?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });
      expect(menu()).toBeNull();
      expect(document.activeElement).toBe(trigger());
    } finally {
      teardown();
    }
  });

  it("closes on outside click", () => {
    setup();
    try {
      act(() => root.render(<Menu label="Watch options" items={items(() => undefined)} />));
      act(() => trigger().click());
      expect(menu()).not.toBeNull();
      act(() => {
        document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      });
      expect(menu()).toBeNull();
    } finally {
      teardown();
    }
  });

  it("moves focus with arrow keys; activating an item selects and closes", () => {
    setup();
    try {
      const onSelect = vi.fn();
      act(() => root.render(<Menu label="Watch options" items={items(onSelect)} />));
      act(() => trigger().click());
      const rows = menuItems();
      expect(rows).toHaveLength(3);
      // Opening focuses the first item.
      expect(document.activeElement).toBe(rows[0]);
      act(() => {
        (document.activeElement as HTMLElement).dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
        );
      });
      expect(document.activeElement).toBe(rows[1]);
      act(() => {
        (document.activeElement as HTMLElement).dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
        );
      });
      expect(document.activeElement).toBe(rows[0]);
      // Enter on a focused native button activates it (browser behaviour);
      // clicking the focused item must select, close, and refocus the trigger.
      const second = rows[1];
      if (!second) throw new Error("second menu item missing");
      act(() => second.click());
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(menu()).toBeNull();
      expect(document.activeElement).toBe(trigger());
    } finally {
      teardown();
    }
  });
});
