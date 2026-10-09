/**
 * GitHub connector — personal-access-token auth (the honest path: GitHub has
 * no extension-friendly OAuth without a backend client secret).
 *
 * The token is validated with `GET /user` and stored in
 * `browser.storage.local` under `diggy:connectors:github`. The plaintext
 * token never leaves this module.
 */
import { browser } from "wxt/browser";

import type { ConnectResult, Connector, ConnectorStatus } from "./types.js";

export const GITHUB_TOKEN_KEY = "diggy:connectors:github";

/** Validate a token against the GitHub API without storing it. */
export async function validateGithubToken(token: string): Promise<boolean> {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
    },
  });
  return response.ok;
}

/** Validate then store a token. Returns `{ ok: false }` without storing on failure. */
export async function saveGithubToken(token: string): Promise<ConnectResult> {
  const trimmed = token.trim();
  if (!trimmed) return { ok: false, error: "Paste a personal access token first." };
  let valid: boolean;
  try {
    valid = await validateGithubToken(trimmed);
  } catch (error) {
    return { ok: false, error: `GitHub check failed (${messageOf(error)}).` };
  }
  if (!valid) {
    return { ok: false, error: "GitHub rejected that token — check it and try again." };
  }
  await browser.storage.local.set({ [GITHUB_TOKEN_KEY]: trimmed });
  return { ok: true };
}

async function readToken(): Promise<string | null> {
  try {
    const store = (await browser.storage.local.get(GITHUB_TOKEN_KEY)) as Record<string, unknown>;
    const value = store[GITHUB_TOKEN_KEY];
    return typeof value === "string" && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function githubStatus(): Promise<ConnectorStatus> {
  const token = await readToken();
  if (!token) return "disconnected";
  try {
    return (await validateGithubToken(token)) ? "connected" : "disconnected";
  } catch {
    return "error";
  }
}

/**
 * Connect GitHub. When called with a token (e.g. from Settings → Apps) it is
 * validated and stored; without one the stored token is re-validated.
 */
export async function connectGithub(token?: string): Promise<ConnectResult> {
  if (token !== undefined && token.trim().length > 0) return saveGithubToken(token);
  const stored = await readToken();
  if (!stored) {
    return { ok: false, error: "No token saved yet — paste a personal access token in Settings → Apps." };
  }
  try {
    const valid = await validateGithubToken(stored);
    return valid
      ? { ok: true }
      : { ok: false, error: "The saved token was rejected by GitHub — replace it in Settings → Apps." };
  } catch (error) {
    return { ok: false, error: `GitHub check failed (${messageOf(error)}).` };
  }
}

export async function disconnectGithub(): Promise<void> {
  await browser.storage.local.remove(GITHUB_TOKEN_KEY);
}

export function createGithubConnector(): Connector {
  return {
    id: "github",
    label: "GitHub",
    category: "Development",
    status: githubStatus,
    connect: () => connectGithub(),
    disconnect: disconnectGithub,
  };
}
