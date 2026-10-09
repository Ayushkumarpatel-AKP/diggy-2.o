// @vitest-environment jsdom
/**
 * Quick-command routing: intent sentinels match exactly first (so `read.repo`
 * reaches the runtime instead of a local status line), the label substring
 * fallback is preserved, and `form.fill` — which has no fixed ActionIntent —
 * travels the ask channel as a goal sentence that names no submit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

import { Dashboard, intentForLabel } from "./Dashboard.js";

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

function clickQuickCommand(label: string) {
  const button = Array.from(container.querySelectorAll("button")).find((el) =>
    el.textContent?.trim().startsWith(label),
  );
  expect(button, `quick command "${label}"`).toBeTruthy();
  act(() => button!.click());
}

describe("intentForLabel", () => {
  it("matches quick-command sentinels exactly", () => {
    expect(intentForLabel("monitor.track")).toBe("track");
    expect(intentForLabel("read.summarize")).toBe("summarize");
    expect(intentForLabel("read.explain")).toBe("explain");
    expect(intentForLabel("read.repo")).toBe("repository");
  });

  it("keeps the label substring fallback", () => {
    expect(intentForLabel("Summarize this page")).toBe("summarize");
    expect(intentForLabel("Track this page")).toBe("track");
    expect(intentForLabel("Explain page")).toBe("explain");
    expect(intentForLabel("Extract important info")).toBe("extract");
    expect(intentForLabel("Analyze repository")).toBe("repository");
  });

  it("returns null for labels and sentinels with no fixed intent", () => {
    expect(intentForLabel("form.fill")).toBe(null);
    expect(intentForLabel("Add Website")).toBe(null);
    expect(intentForLabel("Retry monitor")).toBe(null);
  });
});

describe("dashboard command routing", () => {
  it("routes read.repo to onAction(repository)", () => {
    const onAction = vi.fn();
    const onAsk = vi.fn();
    act(() => root.render(<Dashboard tab="home" onAction={onAction} onAsk={onAsk} />));
    clickQuickCommand("Analyze repository");
    expect(onAction).toHaveBeenCalledWith("repository");
    expect(onAsk).not.toHaveBeenCalled();
  });

  it("routes read.summarize to onAction(summarize)", () => {
    const onAction = vi.fn();
    act(() => root.render(<Dashboard tab="home" onAction={onAction} onAsk={() => undefined} />));
    clickQuickCommand("Summarize page");
    expect(onAction).toHaveBeenCalledWith("summarize");
  });

  it("routes form.fill to onAsk with a no-submit goal sentence", () => {
    const onAction = vi.fn();
    const onAsk = vi.fn();
    act(() => root.render(<Dashboard tab="home" onAction={onAction} onAsk={onAsk} />));
    clickQuickCommand("Fill form");
    expect(onAction).not.toHaveBeenCalled();
    expect(onAsk).toHaveBeenCalledTimes(1);
    const goal = String(onAsk.mock.calls[0]?.[0] ?? "");
    expect(goal.toLowerCase()).toContain("fill");
    expect(goal.toLowerCase()).toContain("without submitting");
  });

  it("metric tiles still navigate when real metrics are passed", () => {
    const onTabChange = vi.fn();
    act(() =>
      root.render(
        <Dashboard
          onTabChange={onTabChange}
          onAction={() => undefined}
          onAsk={() => undefined}
          metrics={[
            { id: "watch", icon: "globe", tone: "blue", value: 7, label: "Websites Monitoring" },
            { id: "alerts", icon: "bell", tone: "pink", value: 3, label: "New Alerts" },
            { id: "actions", icon: "check", tone: "mint", value: 12, label: "Actions Completed" },
            {
              id: "integrations",
              icon: "integrations",
              tone: "violet",
              value: 2,
              label: "Integrations Active",
            },
          ]}
        />,
      ),
    );
    expect(container.textContent).toContain("7");
    const tile = Array.from(container.querySelectorAll("button")).find((el) =>
      el.textContent?.includes("Websites Monitoring"),
    );
    expect(tile, "watch tile").toBeTruthy();
    act(() => tile!.click());
    expect(onTabChange).toHaveBeenCalledWith("monitor");
    expect(container.textContent).toContain("Track websites, get notified");
  });
});
