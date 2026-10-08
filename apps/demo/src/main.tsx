import { createRoot } from "react-dom/client";

import "@diggy/ui/styles.css";
import "./demo.css";
import { App } from "./App.js";

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(<App />);
}
