import { startMonitorScheduler } from "./monitor-scheduler.js";
import { DEFAULT_PORT, startServer } from "./server.js";

const rawPort = process.env.PORT;
const port = rawPort && /^\d+$/.test(rawPort) ? Number.parseInt(rawPort, 10) : DEFAULT_PORT;

startServer(port)
  .then(() => {
    console.log(`@diggy/crawler listening on http://127.0.0.1:${port}`);

    // Optional server-side monitor scheduler (the extension uses chrome.alarms).
    const flag = process.env.DIGGY_MONITOR_SCHEDULER?.trim().toLowerCase();
    if (flag === "1" || flag === "true") {
      startMonitorScheduler({ port });
      console.log(`@diggy/crawler monitor scheduler started (port ${port})`);
    }
  })
  .catch((error: unknown) => {
    console.error("Failed to start @diggy/crawler:", error);
    process.exitCode = 1;
  });
