// @vitest-environment jsdom
/**
 * Mounts the real dashboard in a DOM and clicks through all 7 tabs, failing on any
 * console.error/warn React would print. This is the "no console errors" acceptance gate.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { NAV_TABS, type NavTabId } from "@diggy/shared";

import { Dashboard } from "./Dashboard.js";

const MARKER: Record<NavTabId, string> = {
  home: "Recent Alerts",
  assistant: "Ask me anything about this page",
  monitor: "Track websites, get notified",
  actions: "See what DIGGY has done for you",
  integrations: "Connect your tools",
  vault: "quick access and auto-fill",
  activity: "A record of everything",
};

const flusher = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };

const realConsole = { error: console.error, warn: console.warn };

const MARKER_LABEL: Record<NavTabId, string> = Object.fromEntries(
  NAV_TABS.map((tab) => [tab.id, tab.label]),
) as Record<NavTabId, string>;

let container: HTMLDivElement;
let root: Root;
let consoleErrors: string[];
let consoleWarnings: string[];

beforeEach(() => {
  flusher.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  consoleErrors = [];
  consoleWarnings = [];
  console.error = (...args: unknown[]) => consoleErrors.push(args.map(String).join(" "));
  console.warn = (...args: unknown[]) => consoleWarnings.push(args.map(String).join(" "));
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  console.error = realConsole.error;
  console.warn = realConsole.warn;
  flusher.IS_REACT_ACT_ENVIRONMENT = false;
});

function navButton(id: NavTabId): HTMLButtonElement {
  const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>("button.dg-nav__item"));
  const match = buttons.find((button) => button.textContent?.includes(MARKER_LABEL[id]));
  if (!match) throw new Error(`nav button for ${id} not found`);
  return match;
}

describe("Dashboard (DOM)", () => {
  it("renders every tab in order and logs no console errors or warnings", () => {
    act(() => root.render(<Dashboard />));

    for (const tab of NAV_TABS) {
      act(() => navButton(tab.id).click());
      expect(container.textContent).toContain(MARKER[tab.id]);
    }

    expect(consoleErrors).toEqual([]);
    expect(consoleWarnings).toEqual([]);
  });

  it("opens and closes the command palette", () => {
    act(() => root.render(<Dashboard />));
    act(() => {
      const opener = Array.from(container.querySelectorAll("button")).find((button) =>
        button.textContent?.includes("Open command palette"),
      );
      opener?.click();
    });
    expect(container.querySelector(".dg-palette")).not.toBeNull();
    act(() => {
      container.querySelector<HTMLElement>(".dg-scrim")?.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true }),
      );
    });
    expect(container.querySelector(".dg-palette")).toBeNull();
    expect(consoleErrors).toEqual([]);
  });
});
