/**
 * Public surface of `@diggy/api` — the local connect-backend for the browser
 * extension. Import `buildServer`/`startServer` to run it, or the individual
 * modules for embedding and testing.
 *
 * // INTERFACE FOR INTEGRATION
 * buildServer(options?: BuildServerOptions): FastifyInstance
 * startServer(port?: number, options?: BuildServerOptions): Promise<FastifyInstance>
 * listProviders(): readonly ProviderDefinition[]   // google/notion/github/youtube
 * listPacks(kind?: PackKind): readonly PackLink[]   // student/creator, link-only
 * listConnectors(): ConnectorDefinition[]           // pluggable MCP connectors
 * buildIcs(events: IcsEventInput[]): string         // valid RFC 5545 calendar
 * // END INTERFACE FOR INTEGRATION
 */
export {
  createContext,
  getContext,
  resetContext,
  DEFAULT_DB_PATH,
  DEFAULT_PORT,
  DEFAULT_PUBLIC_URL,
  KV_SESSION_SECRET,
  KV_TOKEN_KEY,
} from './config.js';
export type { AppConfig, AppContext, CreateContextOptions, OAuthCredentials } from './config.js';

export {
  claimPairing,
  createPairing,
  deleteConnection,
  deleteSession,
  getConnection,
  getKv,
  getPairing,
  getSession,
  getUserByGoogleSub,
  getUserById,
  insertSession,
  listConnections,
  openDatabase,
  readyPairing,
  setKv,
  upsertConnection,
  upsertUser,
} from './db.js';
export type {
  ConnectionRow,
  PairingRow,
  SessionRow,
  SqliteDb,
  UpsertConnectionInput,
  UpsertUserInput,
  UserRow,
} from './db.js';

export { decryptString, encryptString, signSession, verifySession, SESSION_TTL_MS } from './crypto.js';
export type { VerifiedSession } from './crypto.js';

export { getProvider, isProviderId, listProviders, PROVIDERS } from './providers.js';
export type { ProviderAuthKind, ProviderDefinition, ProviderId } from './providers.js';

export {
  beginAuth,
  exchangeCode,
  fetchAccountLabel,
  fetchGoogleProfile,
  isOAuthProvider,
  refresh,
  OAuthError,
} from './oauth.js';
export type { TokenSet } from './oauth.js';

export { buildIcs } from './ics.js';
export type { IcsEventInput, IcsOptions } from './ics.js';

export { getPackLink, listPacks, CREATOR_PACK, STUDENT_PACK } from './packs.js';
export type { PackKind, PackLink } from './packs.js';

export {
  getConnector,
  listConnectors,
  registerConnector,
  resetConnectors,
  unregisterConnector,
} from './connectors.js';
export type { ConnectorDefinition, ConnectorKind } from './connectors.js';

export {
  createTaskStore,
  isTaskTool,
  mintDelegationToken,
  verifyDelegationToken,
  DELEGATION_TTL_MS,
  TASK_TOOLS,
} from './mcp.js';
export type {
  DelegatedTask,
  DelegatedTaskStatus,
  TaskStore,
  TaskTool,
} from './mcp.js';

export { buildServer, startServer, HOST } from './server.js';
export type { BuildServerOptions } from './server.js';

export { registerActionRoutes, HttpError, readCalendarEvents } from './routes/actions.js';
export { registerAuthRoutes, requireUser, successHtml, userFromRequest } from './routes/auth.js';
export { registerCalendarRoutes } from './routes/calendar.js';
export { registerConnectorRoutes } from './routes/connectors.js';
export { registerMcpRoutes } from './routes/mcp.js';
export type { McpRoutes } from './routes/mcp.js';
export { registerPackRoutes } from './routes/packs.js';
export { registerPluginRoutes } from './routes/plugins.js';
export {
  faviconUrlFor,
  latestForChannel,
  normalizeChannelInput,
  parseMeta,
  parseYouTubeFeed,
  registerPreviewRoutes,
  resolveChannelId,
} from './routes/preview.js';
export type { MetaResult, YouTubeVideo } from './routes/preview.js';
