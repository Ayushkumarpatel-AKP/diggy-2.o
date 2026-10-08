import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { NAV_TABS, type NavTabId } from "@diggy/shared";

import { Dashboard } from "./Dashboard.js";

/** A distinctive fragment rendered by each screen, keyed by tab id. */
const MARKER: Record<NavTabId, string> = {
  home: "Recent Alerts",
  assistant: "Ask me anything about this page",
  monitor: "Track websites, get notified",
  actions: "See what DIGGY has done for you",
  integrations: "Connect your tools",
  vault: "quick access and auto-fill",
  activity: "A record of everything",
};

describe("Dashboard", () => {
  it("exposes exactly the 7 NAV_TABS in order", () => {
    expect(NAV_TABS.map((tab) => tab.id)).toEqual([
      "home",
      "assistant",
      "monitor",
      "actions",
      "integrations",
      "vault",
      "activity",
    ]);
  });

  for (const tab of NAV_TABS) {
    it(`renders the ${tab.label} tab without throwing`, () => {
      const html = renderToString(<Dashboard tab={tab.id} />);
      expect(html.length).toBeGreaterThan(0);
      expect(html).toContain(MARKER[tab.id]);
      // The sidebar always advertises every tab.
      for (const other of NAV_TABS) {
        expect(html).toContain(other.label);
      }
    });
  }
});
