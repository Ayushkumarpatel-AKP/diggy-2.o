import { useState } from "react";
import { NAV_TABS, type NavTabId } from "@diggy/shared";
import { Dashboard, DiggyLogo, type ScreenState } from "@diggy/ui";

import { ComponentGallery } from "./ComponentGallery.js";
import { OverlayLab } from "./OverlayLab.js";

type View = "dashboard" | "components" | "overlay";

const STATES: ScreenState[] = ["ready", "loading", "empty", "error"];

const VIEWS: Array<{ id: View; label: string }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "components", label: "Components" },
  { id: "overlay", label: "Overlay & Palette" },
];

export function App() {
  const [view, setView] = useState<View>("dashboard");
  const [tab, setTab] = useState<NavTabId>("home");
  const [state, setState] = useState<ScreenState>("ready");

  const screenStates = Object.fromEntries(
    NAV_TABS.map((item) => [item.id, state]),
  ) as Record<NavTabId, ScreenState>;

  return (
    <>
      <header className="demo-topbar">
        <span className="demo-topbar__brand">
          <DiggyLogo size={24} /> DIGGY UI
        </span>
        <nav className="demo-tabs" aria-label="Gallery views">
          {VIEWS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={view === item.id ? "demo-tab demo-tab--active" : "demo-tab"}
              onClick={() => setView(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <span className="demo-spacer" />
        {view === "dashboard" ? (
          <label className="demo-hint demo-state">
            Screen state
            <select
              className="demo-select"
              value={state}
              onChange={(event) => setState(event.target.value as ScreenState)}
              aria-label="Preview screen state"
            >
              {STATES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </header>

      {view === "dashboard" ? (
        <Dashboard tab={tab} onTabChange={setTab} screenStates={screenStates} />
      ) : null}
      {view === "components" ? <ComponentGallery /> : null}
      {view === "overlay" ? <OverlayLab /> : null}
    </>
  );
}
