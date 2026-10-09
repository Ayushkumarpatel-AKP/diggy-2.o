/**
 * Google connector — delegates to the existing PKCE flow in `../google.ts`.
 *
 * This module adds no new OAuth code: `connect()` reads the stored client id
 * (`diggy:google-client-id`, written by Settings) and calls `connectGoogle`;
 * `status()` mirrors `googleStatus`. Tokens stay in `diggy:google`.
 */
import { browser } from "wxt/browser";

import { connectGoogle, disconnectGoogle, googleStatus } from "../google.js";
import type { ConnectResult, Connector, ConnectorStatus } from "./types.js";

export const GOOGLE_CLIENT_ID_KEY = "diggy:google-client-id";

async function readClientId(): Promise<string | null> {
  try {
    const store = (await browser.storage.local.get(GOOGLE_CLIENT_ID_KEY)) as Record<string, unknown>;
    const value = store[GOOGLE_CLIENT_ID_KEY];
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
  } catch {
    return null;
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function googleConnectorStatus(): Promise<ConnectorStatus> {
  try {
    return (await googleStatus()).connected ? "connected" : "disconnected";
  } catch {
    return "error";
  }
}

/** Launch the Google PKCE sign-in using the stored client id. */
export async function connectGoogleConnector(): Promise<ConnectResult> {
  const clientId = await readClientId();
  if (!clientId) {
    return { ok: false, error: "Set a Google Client ID in Settings → Apps first." };
  }
  try {
    await connectGoogle(clientId);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: messageOf(error) };
  }
}

export function createGoogleConnector(): Connector {
  return {
    id: "google",
    label: "Google",
    category: "Productivity",
    status: googleConnectorStatus,
    connect: connectGoogleConnector,
    disconnect: disconnectGoogle,
  };
}
