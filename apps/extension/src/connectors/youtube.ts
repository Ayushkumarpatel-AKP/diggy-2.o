/**
 * YouTube connector — no credential needed.
 *
 * YouTube is driven through the page-driving tool owned by the background
 * agent runtime, so there is nothing to store and nothing to validate. This
 * connector reports `connected` so the integrations screen stays truthful.
 */
import type { ConnectResult, Connector, ConnectorStatus } from "./types.js";

export async function youtubeStatus(): Promise<ConnectorStatus> {
  return "connected";
}

export async function connectYoutube(): Promise<ConnectResult> {
  return { ok: true };
}

export async function disconnectYoutube(): Promise<void> {
  // Nothing stored — nothing to clear.
}

export function createYoutubeConnector(): Connector {
  return {
    id: "youtube",
    label: "YouTube",
    category: "Social",
    status: youtubeStatus,
    connect: connectYoutube,
    disconnect: disconnectYoutube,
  };
}
