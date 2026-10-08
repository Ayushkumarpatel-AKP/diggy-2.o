// @vitest-environment jsdom
/**
 * Mounts the real dashboard in a DOM and exercises every interactive control:
 *  - all 7 tabs (sidebar and the narrow tab strip) switch screens;
 *  - the composer is a controlled input that sends via Enter and the Send button;
 *  - the mic starts voice and attach-file is disabled with a reason;
 *  - NO enabled control is dead, and every disabled control explains why;
 *  - loading / empty / error states render for every screen.
 * Any console.error/warn React would print fails the suite.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { NAV_TABS, type NavTabId } from "@diggy/shared";

import { Dashboard, type DashboardProps } from "./Dashboard.js";

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
  // jsdom has no window.open; the pop-out control must not crash or spam console.
  window.open = vi.fn(
    () => ({ closed: false, close: vi.fn() }) as unknown as Window,
  ) as unknown as typeof window.open;
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  console.error = realConsole.error;
  console.warn = realConsole.warn;
  flusher.IS_REACT_ACT_ENVIRONMENT = false;
});

/** Fresh container + root so each button probe starts from a clean dashboard. */
function renderFresh(props: Partial<DashboardProps> = {}) {
  const el = document.createElement("div");
  document.body.append(el);
  const freshRoot = createRoot(el);
  act(() => freshRoot.render(<Dashboard {...props} />));
  return {
    el,
    cleanup: () => {
      act(() => freshRoot.unmount());
      el.remove();
    },
  };
}

function navButton(id: NavTabId): HTMLButtonElement {
  const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>("button.dg-nav__item"));
  const match = buttons.find((button) => button.textContent?.includes(MARKER_LABEL[id]));
  if (!match) throw new Error(`nav button for ${id} not found`);
  return match;
}

function controlLabel(el: Element): string {
  return (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 48);
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("Dashboard (DOM)", () => {
  it("renders every tab in order and logs no console errors or warnings", () => {
    act(() => root.render(<Dashboard onAction={() => undefined} onSettings={() => undefined} />));

    for (const tab of NAV_TABS) {
      act(() => navButton(tab.id).click());
      expect(container.textContent).toContain(MARKER[tab.id]);
    }

    expect(consoleErrors).toEqual([]);
    expect(consoleWarnings).toEqual([]);
  });

  it("switches all 7 screens from the narrow tab strip", () => {
    act(() => root.render(<Dashboard />));
    const strip = container.querySelector(".dg-tabbar");
    expect(strip).not.toBeNull();

    for (const tab of NAV_TABS) {
      const buttons = Array.from(
        strip!.querySelectorAll<HTMLButtonElement>("button.dg-tab"),
      );
      const button = buttons.find((el) => el.textContent?.includes(MARKER_LABEL[tab.id]));
      expect(button, `tab strip button for ${tab.id}`).toBeTruthy();
      act(() => button!.click());
      expect(container.textContent).toContain(MARKER[tab.id]);
    }
    expect(consoleErrors).toEqual([]);
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

  it("composer: sends typed text via Enter and the Send button, mic starts voice", () => {
    const onAsk = vi.fn();
    const onAction = vi.fn();
    const { el, cleanup } = renderFresh({ tab: "assistant", onAsk, onAction });

    const input = el.querySelector<HTMLInputElement>(".dg-composer__input");
    expect(input).not.toBeNull();

    act(() => setInputValue(input!, "Summarise this page"));
    expect(input!.value).toBe("Summarise this page");
    act(() => {
      input!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(onAsk).toHaveBeenCalledWith("Summarise this page");
    expect(input!.value).toBe("");

    act(() => setInputValue(input!, "What changed today?"));
    act(() => el.querySelector<HTMLButtonElement>(".dg-composer__send")!.click());
    expect(onAsk).toHaveBeenCalledWith("What changed today?");

    act(() => el.querySelector<HTMLButtonElement>('button[aria-label="Start voice input"]')!.click());
    expect(onAction).toHaveBeenCalledWith("voice");

    cleanup();
    expect(consoleErrors).toEqual([]);
  });

  it("disables attach-file with a reason", () => {
    const { el, cleanup } = renderFresh({ tab: "assistant", onAsk: () => undefined });
    const attach = el.querySelector<HTMLButtonElement>('button[aria-label^="Attach file"]');
    expect(attach).not.toBeNull();
    expect(attach!.disabled).toBe(true);
    expect(attach!.getAttribute("aria-disabled")).toBe("true");
    expect((attach!.getAttribute("title") ?? "").length).toBeGreaterThan(0);
    cleanup();
  });

  it("disables settings with a reason when no handler is provided", () => {
    const { el, cleanup } = renderFresh({ tab: "home" });
    const gear = el.querySelector<HTMLButtonElement>('button[aria-label^="Settings"]');
    expect(gear).not.toBeNull();
    expect(gear!.disabled).toBe(true);
    expect((gear!.getAttribute("title") ?? "").length).toBeGreaterThan(0);
    cleanup();
  });

  it("renders loading / empty / error states for every screen", () => {
    for (const tab of NAV_TABS) {
      for (const state of ["loading", "empty", "error"] as const) {
        const screenStates: Partial<Record<NavTabId, (typeof state)>> = {};
        screenStates[tab.id] = state;
        const { el, cleanup } = renderFresh({ tab: tab.id, screenStates });
        expect(el.querySelector(".dg-state"), `${tab.id} · ${state}`).not.toBeNull();
        cleanup();
      }
    }
    expect(consoleErrors).toEqual([]);
  });

  it(
    "no dead buttons: every enabled control acts, every disabled one explains why",
    () => {
      const onAction = vi.fn();
      const onAsk = vi.fn();
      const onTabChange = vi.fn();
      const onSettings = vi.fn();
      // The status bubble pushes every acknowledgement to `AvatarAPI.status`, so this spy
      // is a reliable signal that a control did something even before the typewriter reveals it.
      const onStatus = vi.fn();
      const probeProps = {
        onAction,
        onAsk,
        onTabChange,
        onSettings,
        statusApi: { status: onStatus },
      };

      for (const tab of NAV_TABS) {
        const { el, cleanup } = renderFresh({ tab: tab.id, ...probeProps });
        const controls = Array.from(
          el.querySelectorAll<HTMLElement>('button, [role="button"]'),
        );
        expect(controls.length, `${tab.id} has controls`).toBeGreaterThan(0);
        cleanup();

        for (let index = 0; index < controls.length; index += 1) {
          const probe = renderFresh({ tab: tab.id, ...probeProps });
          const control = Array.from(
            probe.el.querySelectorAll<HTMLElement>('button, [role="button"]'),
          )[index];
          if (!control) throw new Error(`${tab.id} control #${index} is missing`);

          if (control instanceof HTMLButtonElement && control.disabled) {
            const reason =
              control.getAttribute("title") ?? control.getAttribute("aria-label") ?? "";
            expect(control.getAttribute("aria-disabled"), controlLabel(control)).toBe("true");
            expect(reason.trim().length, `disabled reason for "${controlLabel(control)}"`).toBeGreaterThan(0);
          } else if (
            control.getAttribute("aria-selected") === "true" ||
            control.getAttribute("aria-current") !== null
          ) {
            // The already-selected tab/section — re-selecting it is idempotent, not a dead click.
          } else {
            const before = probe.el.innerHTML;
            const paletteBefore = probe.el.querySelectorAll(".dg-palette").length;
            const callsBefore =
              onAction.mock.calls.length +
              onAsk.mock.calls.length +
              onTabChange.mock.calls.length +
              onSettings.mock.calls.length +
              onStatus.mock.calls.length;

            act(() => control.click());

            const after = probe.el.innerHTML;
            const paletteAfter = probe.el.querySelectorAll(".dg-palette").length;
            const callsAfter =
              onAction.mock.calls.length +
              onAsk.mock.calls.length +
              onTabChange.mock.calls.length +
              onSettings.mock.calls.length +
              onStatus.mock.calls.length;

            expect(
              before !== after || paletteAfter !== paletteBefore || callsAfter > callsBefore,
              `dead control "${controlLabel(control)}" on ${tab.id}`,
            ).toBe(true);
          }

          probe.cleanup();
        }
      }

      expect(consoleErrors).toEqual([]);
    },
    120_000,
  );
});
