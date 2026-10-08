import { createRoot } from "react-dom/client";

import { NAV_TABS, tokens } from "@diggy/shared";
import "../../assets/app.css";

function SidePanel() {
  return (
    <main style={{ background: tokens.color.bg, minHeight: "100vh", padding: 16 }}>
      <h1 style={{ color: tokens.color.primaryInk, margin: 0 }}>DIGGY</h1>
      <p style={{ color: tokens.color.muted }}>Side panel scaffold — the UI worker owns this surface.</p>
      <ul>
        {NAV_TABS.map((tab) => (
          <li key={tab.id}>{tab.label}</li>
        ))}
      </ul>
    </main>
  );
}

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(<SidePanel />);
}
