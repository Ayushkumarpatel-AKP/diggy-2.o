import { BusEvents, createBus } from "@diggy/shared";

/**
 * Extension background service worker.
 * Owns only the shared plumbing: bus bootstrap, side-panel behavior, storage warm-up.
 * Feature logic (monitor, actions, voice, avatar) lives in its owning package.
 */
const bus = createBus({ source: "background" });

/** `sidePanel` is a valid MV3 API but missing from WXT 0.19 browser typings. */
interface SidePanelApi {
  setPanelBehavior(options: { openPanelOnActionClick?: boolean }): Promise<void>;
}

function getSidePanel(): SidePanelApi | undefined {
  return (browser as unknown as { sidePanel?: SidePanelApi }).sidePanel;
}

export default defineBackground(() => {
  bus.emit(BusEvents.AvatarStatus, { text: "DIGGY is ready" });

  browser.runtime.onInstalled.addListener(() => {
    const sidePanel = getSidePanel();
    if (!sidePanel) return;
    void sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((error: unknown) => console.error("[diggy] side panel behavior failed", error));
  });
});
