/**
 * Honestly-stubbed connectors: Slack, Discord, Linear, Spotify.
 *
 * These services have no connect flow wired yet, so `status()` reports
 * `disconnected` and `connect()` says so explicitly — never a faked
 * connection. The screen renders them as not connected.
 */
import type { ConnectResult, Connector, ConnectorCategory } from "./types.js";

const NOT_WIRED = "Not wired yet";

async function stubStatus(): Promise<"disconnected"> {
  return "disconnected";
}

async function stubConnect(): Promise<ConnectResult> {
  return { ok: false, error: NOT_WIRED };
}

async function stubDisconnect(): Promise<void> {
  // Nothing stored — nothing to clear.
}

function createStubConnector(id: string, label: string, category: ConnectorCategory): Connector {
  return { id, label, category, status: stubStatus, connect: stubConnect, disconnect: stubDisconnect };
}

export function createSlackConnector(): Connector {
  return createStubConnector("slack", "Slack", "Productivity");
}

export function createDiscordConnector(): Connector {
  return createStubConnector("discord", "Discord", "Social");
}

export function createLinearConnector(): Connector {
  return createStubConnector("linear", "Linear", "Development");
}

export function createSpotifyConnector(): Connector {
  return createStubConnector("spotify", "Spotify", "Social");
}
