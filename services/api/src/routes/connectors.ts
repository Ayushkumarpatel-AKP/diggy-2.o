/**
 * Connector registry routes.
 *
 * `GET /connectors` lists every pluggable connector (OAuth providers,
 * link-only pack entries, local services). Registration itself is code-level
 * (`registerConnector`) — the API surface is read-only by design.
 */
import type { FastifyInstance } from 'fastify';

import { getConnector, listConnectors } from '../connectors.js';

export function registerConnectorRoutes(app: FastifyInstance): void {
  app.get('/connectors', async () => ({ connectors: listConnectors() }));

  app.get<{ Params: { id: string } }>('/connectors/:id', async (request, reply) => {
    const connector = getConnector(request.params.id);
    if (!connector) {
      reply.code(404);
      return { error: 'unknown_connector', message: `No connector "${request.params.id}".` };
    }
    return connector;
  });
}
