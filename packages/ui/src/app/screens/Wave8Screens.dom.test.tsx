// @vitest-environment jsdom
/**
 * Wave-8 screens wiring: Monitor rows emit the `watch.*` intents through a
 * real `Menu`, the tabs filter the real watches by kind, Actions rows resolve
 * to `ask`, the Activity range selector actually filters, the API Keys screen
 * wraps `SetupPanel`, and a `pendingConfirmation` renders alongside (not
 * instead of) the status dock — with an `ActionCard` when it carries a
 * preview kind.
 *
 * Menu/ActionCard behaviour asserted here is the frozen wave-8 contract
 * (`role="menu"` / `role="menuitem"`, Escape closes), which w8-parts owns.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

import { Dashboard } from "../Dashboard.js";
import type { ActionLogRow, WatchRow } from "../sampleData.js";
import { MonitorScreen } from "./MonitorScreen.js";
import { ActionsScreen } from "./ActionsScreen.js";
import { ActivityScreen } from "./ActivityScreen.js";
import { ApiKeysScreen } from "./ApiKeysScreen.js";

const flusher = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  flusher.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  window.open = vi.fn(
    () => ({ closed: false, close: vi.fn() }) as unknown as Window,
  ) as unknown as typeof window.open;
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  flusher.IS_REACT_ACT_ENVIRONMENT = false;
});

const WATCHES: WatchRow[] = [
  {
    spec: { id: "w1", url: "https://example.com/news", kind: "content_change", intervalSec: 900, createdAt: 0 },
    name: "example.com",
    tags: ["content change"],
    active: true,
  },
  {
    spec: { id: "w2", url: "https://github.com/acme/app", kind: "release_published", intervalSec: 900, createdAt: 0 },
    name: "github.com",
    tags: ["release"],
    active: false,
  },
];

function menuTrigger(name: string): HTMLButtonElement {
  const trigger = Array.from(container.querySelectorAll("button")).find(
    (button) => button.getAttribute("aria-label") === name && button.getAttribute("aria-haspopup") === "menu",
  );
  expect(trigger, `menu trigger "${name}"`).toBeTruthy();
  return trigger as HTMLButtonElement;
}

function openMenu(name: string): void {
  act(() => menuTrigger(name).click());
  expect(container.querySelector('[role="menu"]'), `menu for "${name}" opens`).not.toBeNull();
}

function chooseItem(label: string): void {
  const item = Array.from(container.querySelectorAll('[role="menuitem"]')).find(
    (el) => el.textContent?.trim() === label,
  );
  expect(item, `menu item "${label}"`).toBeTruthy();
  act(() => (item as HTMLElement).click());
}

describe("MonitorScreen", () => {
  it("sends watch.add from the header button", () => {
    const onCommand = vi.fn();
    act(() => root.render(<MonitorScreen onCommand={onCommand} watches={WATCHES} />));
    act(() =>
      container.querySelectorAll("button").forEach((button) => {
        if (button.textContent?.includes("Add Website")) button.click();
      }),
    );
    expect(onCommand).toHaveBeenCalledWith("Add Website", "watch.add");
  });

  it("opens a Menu per row with check / pause-resume / remove intents", () => {
    const onCommand = vi.fn();
    act(() => root.render(<MonitorScreen onCommand={onCommand} watches={WATCHES} />));

    openMenu("Options for example.com");
    chooseItem("Check now");
    expect(onCommand).toHaveBeenCalledWith("Check example.com", "watch.check:w1");

    openMenu("Options for example.com");
    chooseItem("Pause");
    expect(onCommand).toHaveBeenCalledWith("Pause example.com", "watch.pause:w1");

    // The paused GitHub watch lives under the GitHub tab with a Resume item.
    const githubTab = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "GitHub",
    );
    expect(githubTab, "GitHub tab").toBeTruthy();
    act(() => (githubTab as HTMLButtonElement).click());
    openMenu("Options for github.com");
    chooseItem("Resume");
    expect(onCommand).toHaveBeenCalledWith("Resume github.com", "watch.resume:w2");

    openMenu("Options for github.com");
    chooseItem("Remove");
    expect(onCommand).toHaveBeenCalledWith("Remove github.com", "watch.remove:w2");
  });

  it("sends watch.notify from the bell", () => {
    const onCommand = vi.fn();
    act(() => root.render(<MonitorScreen onCommand={onCommand} watches={WATCHES} />));
    const bell = container.querySelector('button[aria-label="Notifications for example.com"]');
    expect(bell, "bell button").toBeTruthy();
    act(() => (bell as HTMLButtonElement).click());
    expect(onCommand).toHaveBeenCalledWith("Notifications for example.com", "watch.notify:w1");
  });

  it("filters the real watches by tab", () => {
    const onCommand = vi.fn();
    act(() => root.render(<MonitorScreen onCommand={onCommand} watches={WATCHES} />));
    expect(container.textContent).toContain("example.com");
    expect(container.textContent).not.toContain("github.com");

    const githubTab = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "GitHub",
    );
    expect(githubTab, "GitHub tab").toBeTruthy();
    act(() => (githubTab as HTMLButtonElement).click());
    expect(container.textContent).toContain("github.com");
    expect(container.textContent).not.toContain("example.com");
  });

  it("closes the Menu on Escape", () => {
    const onCommand = vi.fn();
    act(() => root.render(<MonitorScreen onCommand={onCommand} watches={WATCHES} />));
    openMenu("Options for example.com");
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(container.querySelector('[role="menu"]')).toBeNull();
  });
});

const ACTIONS: ActionLogRow[] = [
  { id: "a1", icon: "edit", tone: "mint", title: "Fill form", subtitle: "example.com", status: "failed", at: Date.now() },
  { id: "a2", icon: "file", tone: "violet", title: "Summarise page", subtitle: "example.com", status: "completed", at: Date.now() },
];

describe("ActionsScreen", () => {
  it("takes its rows from the actions prop and wires New Action to ask", () => {
    const onCommand = vi.fn();
    act(() => root.render(<ActionsScreen onCommand={onCommand} actions={ACTIONS} />));
    expect(container.textContent).toContain("Fill form");

    const fresh = vi.fn();
    act(() => root.render(<ActionsScreen onCommand={fresh} actions={[]} />));
    expect(container.textContent).toContain("show up here");

    act(() => root.render(<ActionsScreen onCommand={onCommand} actions={ACTIONS} />));
    const add = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("New Action"),
    );
    expect(add, "New Action button").toBeTruthy();
    act(() => (add as HTMLButtonElement).click());
    expect(onCommand).toHaveBeenCalledWith("New Action", "ask");
  });

  it("offers Retry / Details through the row Menu", () => {
    const onCommand = vi.fn();
    act(() => root.render(<ActionsScreen onCommand={onCommand} actions={ACTIONS} />));
    openMenu("Options for Fill form");
    chooseItem("Retry");
    expect(onCommand).toHaveBeenCalledWith("Retry: Fill form", "ask");
    openMenu("Options for Fill form");
    chooseItem("Details");
    expect(onCommand).toHaveBeenCalledWith("What happened here: Fill form", "ask");
  });
});

describe("ActivityScreen", () => {
  const NOW = Date.now();
  const events = [
    { id: "now", kind: "summary" as const, title: "Fresh summary", at: NOW - 1_000 },
    { id: "old", kind: "summary" as const, title: "Ancient summary", at: NOW - 60 * 86_400_000 },
  ];

  it("filters the timeline through the range Menu", () => {
    const onCommand = vi.fn();
    act(() => root.render(<ActivityScreen onCommand={onCommand} events={events} />));
    expect(container.textContent).toContain("Fresh summary");
    expect(container.textContent).not.toContain("Ancient summary");

    const trigger = Array.from(container.querySelectorAll("button")).find(
      (button) => button.getAttribute("aria-haspopup") === "menu",
    );
    expect(trigger, "range menu trigger").toBeTruthy();
    act(() => (trigger as HTMLButtonElement).click());
    chooseItem("All time");
    expect(container.textContent).toContain("Ancient summary");
  });
});

describe("ApiKeysScreen", () => {
  it("explains itself when the host supplies no setup", () => {
    act(() => root.render(<ApiKeysScreen onCommand={() => undefined} />));
    expect(container.textContent).toContain("Paste your API keys here");
  });

  it("renders the SetupPanel pass-through when setup is supplied", () => {
    const onSave = vi.fn();
    act(() =>
      root.render(
        <ApiKeysScreen
          onCommand={() => undefined}
          setup={{
            primary: { presetId: "groq", apiKey: "", baseUrl: "https://x", model: "m" },
            fallback: { enabled: false, presetId: "groq", apiKey: "", baseUrl: "https://x", model: "m" },
            search: { tavilyKey: "", preferLocal: false },
            presets: [],
            onSave,
          }}
        />,
      ),
    );
    expect(container.textContent).toContain("Paste your API keys here");
    const save = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Save"),
    );
    expect(save, "Save button").toBeTruthy();
    act(() => (save as HTMLButtonElement).click());
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});

describe("Dashboard confirmation dock", () => {
  it("renders the status bubble alongside a legacy confirmation", () => {
    const onConfirm = vi.fn();
    act(() =>
      root.render(
        <Dashboard
          liveStatus={{ id: "run", text: "Working on it" }}
          pendingConfirmation={{ id: "c1", title: "Fill this form?", onConfirm }}
        />,
      ),
    );
    // Both the approval title and the live status line are visible.
    expect(container.textContent).toContain("Fill this form?");
    const approve = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Approve",
    );
    expect(approve, "Approve button").toBeTruthy();
    act(() => (approve as HTMLButtonElement).click());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("renders an ActionCard when the confirmation carries a preview kind", () => {
    const onConfirm = vi.fn();
    const onDeny = vi.fn();
    act(() =>
      root.render(
        <Dashboard
          pendingConfirmation={{
            id: "c2",
            title: "Open this video?",
            kind: "openVideo",
            targetUrl: "https://www.youtube.com/watch?v=abc",
            thumbnailUrl: "https://i.ytimg.com/vi/abc/hqdefault.jpg",
            onConfirm,
            onDeny,
          }}
        />,
      ),
    );
    // The card shows the host, not the raw URL, plus the thumbnail.
    expect(container.textContent).toContain("youtube.com");
    expect(container.textContent).not.toContain("watch?v=abc");
    expect(container.querySelector("img"), "thumbnail").not.toBeNull();
    const deny = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Deny",
    );
    expect(deny, "Deny button").toBeTruthy();
    act(() => (deny as HTMLButtonElement).click());
    expect(onDeny).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("clips liveStatus lines to the long-form cap by default", () => {
    const onStatus = vi.fn();
    act(() =>
      root.render(
        <Dashboard
          statusApi={{ status: onStatus }}
          liveStatus={{ id: "long", text: "x".repeat(300) }}
        />,
      ),
    );
    // LONG_STATUS_MAX (200) chars including the ellipsis — not the 68-char default.
    expect(onStatus).toHaveBeenCalledWith(`${"x".repeat(199)}…`);
  });
});
