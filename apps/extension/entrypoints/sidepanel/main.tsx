/**
 * Side panel entrypoint — the real 7-tab DIGGY dashboard.
 *
 * The dashboard is presentational; every action a button triggers (and every
 * question the composer sends) is forwarded to the extension runtime
 * (`diggy:action`), which owns the page reading, the model call and the reply.
 */
import { createRoot } from "react-dom/client";

import { Dashboard } from "../../../../packages/ui/src/index.js";
import "../../../../packages/ui/src/styles.css";
import "../../assets/app.css";

function SidePanel() {
  return (
    <Dashboard
      onSettings={() => {
        void browser.runtime.openOptionsPage();
      }}
      onAction={(intent) => {
        void browser.runtime.sendMessage({ type: "diggy:action", intent }).catch(() => undefined);
      }}
      onAsk={(text) => {
        void browser.runtime
          .sendMessage({ type: "diggy:action", intent: "ask", text })
          .catch(() => undefined);
      }}
    />
  );
}

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(<SidePanel />);
}
