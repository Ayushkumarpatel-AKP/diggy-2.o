// @vitest-environment jsdom
/**
 * w7-panels routing: an explicit runtime `intent` supplied by a screen goes to
 * `onCommand` verbatim; anything else keeps the legacy `onAction`/`onAsk`
 * mapping, and the integrations rows explain themselves (purpose per service,
 * disabled-with-reason for connectors with no connect flow yet).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

import { Dashboard } from "./Dashboard.js";
import { IntegrationsScreen } from "./screens/IntegrationsScreen.js";
import type { IntegrationRow } from "./sampleData.js";

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

function clickButton(text: string): void {
  const button = Array.from(container.querySelectorAll("button")).find((el) =>
    el.textContent?.includes(text),
  );
  expect(button, `button "${text}"`).toBeTruthy();
  act(() => button!.click());
}

const ROWS: IntegrationRow[] = [
  { id: "github", name: "GitHub", category: "Development", color: "#333", mark: "GH", status: "connected" },
  { id: "notion", name: "Notion", category: "Productivity", color: "#fff", mark: "N", status: "connect" },
  { id: "slack", name: "Slack", category: "Productivity", color: "#611f69", mark: "S", status: "connect" },
];

describe("dashboard onCommand routing", () => {
  it("forwards an explicit runtime intent verbatim to onCommand", () => {
    const onCommand = vi.fn();
    const onAction = vi.fn();
    act(() =>
      root.render(
        <Dashboard tab="monitor" onCommand={onCommand} onAction={onAction} onAsk={() => undefined} />,
      ),
    );
    clickButton("Add Website");
    expect(onCommand).toHaveBeenCalledWith("Add Website", "watch.add");
    expect(onAction).not.toHaveBeenCalled();
  });

  it("acknowledges locally when the runtime channel is absent", () => {
    const onAction = vi.fn();
    const onStatus = vi.fn();
    act(() =>
      root.render(
        <Dashboard tab="monitor" onAction={onAction} statusApi={{ status: onStatus }} />,
      ),
    );
    clickButton("Add Website");
    // `watch.add` has no ActionIntent mapping, so with no runtime wired the
    // dashboard falls back to a local status line instead of a dead click.
    expect(onAction).not.toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledWith("Add Website · watch.add");
  });

  it("keeps legacy sentinel routing when onCommand is also wired", () => {
    const onCommand = vi.fn();
    const onAction = vi.fn();
    const onAsk = vi.fn();
    act(() =>
      root.render(
        <Dashboard tab="home" onCommand={onCommand} onAction={onAction} onAsk={onAsk} />,
      ),
    );
    clickButton("Analyze repository");
    expect(onAction).toHaveBeenCalledWith("repository");
    expect(onCommand).not.toHaveBeenCalled();
    clickButton("Fill form");
    expect(onAsk).toHaveBeenCalledTimes(1);
    expect(onCommand).not.toHaveBeenCalled();
  });
});

describe("IntegrationsScreen", () => {
  it("sends connect/disconnect intents with the row id", () => {
    const onCommand = vi.fn();
    act(() => root.render(<IntegrationsScreen onCommand={onCommand} integrations={ROWS} />));
    clickButton("Disconnect");
    expect(onCommand).toHaveBeenCalledWith("GitHub disconnect", "integration.disconnect:github");
    const connect = Array.from(container.querySelectorAll("button")).find(
      (el) => el.textContent?.trim() === "Connect",
    );
    expect(connect, 'button "Connect"').toBeTruthy();
    act(() => connect!.click());
    expect(onCommand).toHaveBeenCalledWith("Notion connect", "integration.connect:notion");
  });

  it("shows what each service is for", () => {
    const onCommand = vi.fn();
    act(() => root.render(<IntegrationsScreen onCommand={onCommand} integrations={ROWS} />));
    expect(container.textContent).toContain("Repositories");
    expect(container.textContent).toContain("Connecting is optional");
  });

  it("disables the connect button with a reason when no connect flow exists", () => {
    const onCommand = vi.fn();
    act(() => root.render(<IntegrationsScreen onCommand={onCommand} integrations={ROWS} />));
    const slackRow = Array.from(container.querySelectorAll(".dg-intg")).find((el) =>
      el.textContent?.includes("Slack"),
    );
    expect(slackRow, "slack row").toBeTruthy();
    const button = slackRow!.querySelector("button");
    expect(button, "slack button").toBeTruthy();
    expect(button!.disabled).toBe(true);
    expect(button!.getAttribute("title")).toContain("isn't available");
    act(() => button!.click());
    expect(onCommand).not.toHaveBeenCalled();
  });
});
