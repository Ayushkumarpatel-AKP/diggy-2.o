/**
 * Connector factory — the single entry point the background calls.
 *
 * // INTERFACE FOR INTEGRATION
 * function createConnectors(): Connector[]
 * // END INTERFACE FOR INTEGRATION
 */
import { createGithubConnector } from "./github.js";
import { createGoogleConnector } from "./google.js";
import { createNotionConnector } from "./notion.js";
import {
  createDiscordConnector,
  createLinearConnector,
  createSlackConnector,
  createSpotifyConnector,
} from "./placeholders.js";
import { createYoutubeConnector } from "./youtube.js";
import type { Connector } from "./types.js";

export type { ConnectResult, Connector, ConnectorCategory, ConnectorStatus } from "./types.js";
export { GITHUB_TOKEN_KEY, connectGithub, saveGithubToken } from "./github.js";
export { GOOGLE_CLIENT_ID_KEY } from "./google.js";
export { NOTION_TOKEN_KEY, NOTION_VERSION, connectNotion, saveNotionToken } from "./notion.js";

/** All connectors: Google, GitHub, Notion, YouTube + honestly-stubbed rest. */
export function createConnectors(): Connector[] {
  return [
    createGoogleConnector(),
    createGithubConnector(),
    createNotionConnector(),
    createYoutubeConnector(),
    createSlackConnector(),
    createDiscordConnector(),
    createLinearConnector(),
    createSpotifyConnector(),
  ];
}
