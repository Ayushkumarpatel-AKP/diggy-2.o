import { useState } from "react";
import { NAV_TABS, type NavTabId } from "@diggy/shared";
import { Dashboard, DiggyLogo } from "@diggy/ui";

import { ComponentGallery } from "./ComponentGallery.js";
import { OverlayLab } from "./OverlayLab.js";

type View = NavTabId | "components" | "overlay";

function isTabView(view: View): view is NavTabId {
  return NAV_TABS.some((tab) => tab.id === view);
}

export function App() {
  const [view, setView] = useState<View>("home");

  return (
    <>
      <header className="demo-topbar">
        <span className="demo-topbar__brand">
          <DiggyLogo size={24} /> DIGGY UI
        </span>
        <nav className="demo-tabs" aria-label="Gallery views">
          {NAV_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={view === tab.id ? "demo-tab demo-tab--active" : "demo-tab"}
              onClick={() => setView(tab.id)}
            >
              {tab.label}
            </button>
          ))}
          <button
            type="button"
            className={view === "components" ? "demo-tab demo-tab--active" : "demo-tab"}
            onClick={() => setView("components")}
          >
            Components
          </button>
          <button
            type="button"
            className={view === "overlay" ? "demo-tab demo-tab--active" : "demo-tab"}
            onClick={() => setView("overlay")}
          >
            Overlay &amp; Palette
          </button>
        </nav>
        <span className="demo-spacer" />
        <span className="demo-hint">Alt+K palette · Alt+Space pop-out</span>
      </header>

      {isTabView(view) ? <Dashboard tab={view} onTabChange={setView} /> : null}
      {view === "components" ? <ComponentGallery /> : null}
      {view === "overlay" ? <OverlayLab /> : null}
    </>
  );
}
