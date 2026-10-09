/**
 * Notion connector — integration-token auth.
 *
 * The token is validated with `POST /v1/search` (Notion-Version 2022-06-28)
 * and stored in `browser.storage.local` under `diggy:connectors:notion`.
 * The plaintext token never leaves this module.
 */
import { browser } from "wxt/browser";

import type { ConnectResult, Connector, ConnectorStatus } from "./types.js";

export const NOTION_TOKEN_KEY = "diggy:connectors:notion";
export const NOTION_VERSION = "2022-06-28";

/** Validate a token against the Notion API without storing it. */
export async function validateNotionToken(token: string): Promise<boolean> {
  const response = await fetch("https://api.notion.com/v1/search", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({ page_size: 1 }),
  });
  return response.ok;
}

/** Validate then store a token. Returns `{ ok: false }` without storing on failure. */
export async function saveNotionToken(token: string): Promise<ConnectResult> {
  const trimmed = token.trim();
  if (!trimmed) return { ok: false, error: "Paste an integration token first." };
  let valid: boolean;
  try {
    valid = await validateNotionToken(trimmed);
  } catch (error) {
    return { ok: false, error: `Notion check failed (${messageOf(error)}).` };
  }
  if (!valid) {
    return { ok: false, error: "Notion rejected that token — check it and try again." };
  }
  await browser.storage.local.set({ [NOTION_TOKEN_KEY]: trimmed });
  return { ok: true };
}

async function readToken(): Promise<string | null> {
  try {
    const store = (await browser.storage.local.get(NOTION_TOKEN_KEY)) as Record<string, unknown>;
    const value = store[NOTION_TOKEN_KEY];
    return typeof value === "string" && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function notionStatus(): Promise<ConnectorStatus> {
  const token = await readToken();
  if (!token) return "disconnected";
  try {
    return (await validateNotionToken(token)) ? "connected" : "disconnected";
  } catch {
    return "error";
  }
}

/**
 * Connect Notion. When called with a token (e.g. from Settings → Apps) it is
 * validated and stored; without one the stored token is re-validated.
 */
export async function connectNotion(token?: string): Promise<ConnectResult> {
  if (token !== undefined && token.trim().length > 0) return saveNotionToken(token);
  const stored = await readToken();
  if (!stored) {
    return { ok: false, error: "No token saved yet — paste an integration token in Settings → Apps." };
  }
  try {
    const valid = await validateNotionToken(stored);
    return valid
      ? { ok: true }
      : { ok: false, error: "The saved token was rejected by Notion — replace it in Settings → Apps." };
  } catch (error) {
    return { ok: false, error: `Notion check failed (${messageOf(error)}).` };
  }
}

export async function disconnectNotion(): Promise<void> {
  await browser.storage.local.remove(NOTION_TOKEN_KEY);
}

export function createNotionConnector(): Connector {
  return {
    id: "notion",
    label: "Notion",
    category: "Productivity",
    status: notionStatus,
    connect: () => connectNotion(),
    disconnect: disconnectNotion,
  };
}
