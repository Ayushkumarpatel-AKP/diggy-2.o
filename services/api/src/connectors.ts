/**
 * Pluggable MCP connector registry (openbrowse `packages/connectors` pattern).
 *
 * A connector describes one external capability (an OAuth provider, a
 * link-only pack entry, or a local service like the crawler) together with the
 * task-level actions Diggy may invoke on it. Connectors are registered at
 * startup from the built-in providers/packs, and third-party code can add more
 * via {@link registerConnector} without touching this package.
 *
 * // INTERFACE FOR INTEGRATION
 * listConnectors(): ConnectorDefinition[]
 * getConnector(id: string): ConnectorDefinition | undefined
 * registerConnector(def: ConnectorDefinition): void  // throws on duplicate id
 * // END INTERFACE FOR INTEGRATION
 */
import { listPacks } from './packs.js';
import { listProviders } from './providers.js';

export type ConnectorKind = 'oauth' | 'link' | 'local';

export interface ConnectorDefinition {
  /** Stable id, e.g. `'google'`, `'leetcode'`, `'crawler'`. */
  id: string;
  name: string;
  description: string;
  kind: ConnectorKind;
  /** Task-level action names this connector serves (see `routes/actions.ts`). */
  actions: string[];
  /** Where the user can read more / manage access. */
  docs?: string;
}

const registry = new Map<string, ConnectorDefinition>();
let builtinsSeeded = false;

function seedBuiltins(): void {
  if (builtinsSeeded) return;
  builtinsSeeded = true;

  for (const provider of listProviders()) {
    const actions =
      provider.id === 'google'
        ? ['gmail.list', 'calendar.list', 'calendar.create', 'calendar.export']
        : provider.id === 'notion'
          ? ['search', 'createPage']
          : provider.id === 'github'
            ? ['me', 'listRepos', 'createIssue']
            : ['latest'];
    registry.set(provider.id, {
      id: provider.id,
      name: provider.name,
      description: provider.description,
      kind: provider.auth === 'oauth2' ? 'oauth' : 'local',
      actions,
      docs: provider.docs,
    });
  }

  for (const link of listPacks()) {
    registry.set(link.id, {
      id: link.id,
      name: link.name,
      description: link.description,
      kind: 'link',
      actions: [],
      docs: link.url,
    });
  }

  registry.set('crawler', {
    id: 'crawler',
    name: 'Web Crawler',
    description: 'Local Crawlee + Playwright research service (extract, crawl, search).',
    kind: 'local',
    actions: ['extract', 'crawl', 'search'],
    docs: 'http://127.0.0.1:17322/health',
  });
}

/** Register a connector. Throws `duplicate_connector` when the id is taken. */
export function registerConnector(def: ConnectorDefinition): void {
  seedBuiltins();
  const id = def.id?.trim();
  if (!id) throw new Error('Connector id is required.');
  if (registry.has(id)) {
    const error = new Error(`Connector "${id}" is already registered.`) as Error & {
      code?: string;
    };
    error.code = 'duplicate_connector';
    throw error;
  }
  registry.set(id, { ...def, id });
}

/** Remove a connector. Returns `true` when one was registered. */
export function unregisterConnector(id: string): boolean {
  seedBuiltins();
  return registry.delete(id);
}

/** Look up one connector by id. */
export function getConnector(id: string): ConnectorDefinition | undefined {
  seedBuiltins();
  return registry.get(id);
}

/** List every registered connector, built-ins first (insertion order). */
export function listConnectors(): ConnectorDefinition[] {
  seedBuiltins();
  return [...registry.values()];
}

/** Test helper: drop back to just the built-ins. */
export function resetConnectors(): void {
  registry.clear();
  builtinsSeeded = false;
  seedBuiltins();
}
