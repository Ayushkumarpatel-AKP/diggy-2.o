import { createRoot } from "react-dom/client";

import { tokens } from "@diggy/shared";
import "../../assets/app.css";

function Settings() {
  return (
    <main style={{ background: tokens.color.bg, minHeight: "100vh", padding: 24 }}>
      <h1 style={{ color: tokens.color.primaryInk, margin: 0 }}>DIGGY Settings</h1>
      <p style={{ color: tokens.color.muted }}>
        Settings scaffold — provider, vault and integration options arrive with their owners.
      </p>
    </main>
  );
}

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(<Settings />);
}
