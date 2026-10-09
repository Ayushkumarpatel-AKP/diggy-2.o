/**
 * On-page overlay — the avatar's status/thought bubble.
 * Renders the shared `StatusBubble` so the on-page chip and the side panel speak with one
 * voice. The avatar renderer (`packages/avatar`) mounts into the `avatar` slot.
 */
import { createRoot } from "react-dom/client";
import { useState } from "react";

import { StatusBubble } from "../../../../packages/ui/src/index.js";
import "../../../../packages/ui/src/styles.css";

function Overlay() {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div style={{ padding: 12, background: "transparent" }}>
      <StatusBubble
        text="Ready — press Ctrl+Space to talk."
        priority={0}
        variant="thought"
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((value) => !value)}
      />
    </div>
  );
}

const container = document.getElementById("overlay-root");
if (container) {
  createRoot(container).render(<Overlay />);
}
