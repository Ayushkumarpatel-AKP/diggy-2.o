/**
 * Side panel entrypoint — the real 7-tab DIGGY dashboard.
 *
 * NOTE: `apps/extension/package.json` is core-owned, so this entrypoint reaches the UI
 * package by relative path instead of a workspace dependency. When core next touches the
 * manifest, adding `"@diggy/ui": "workspace:*"` lets this become
 * `import { Dashboard } from "@diggy/ui"` with no other change.
 */
import { createRoot } from "react-dom/client";

import { Dashboard } from "../../../../packages/ui/src/index.js";
import "../../../../packages/ui/src/styles.css";
import "../../assets/app.css";

function SidePanel() {
  return <Dashboard />;
}

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(<SidePanel />);
}
