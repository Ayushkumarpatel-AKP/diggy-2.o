/**
 * Student + Creator pack routes.
 *
 * Serves the link-only registries (`/packs`, `/packs/:kind`). No auth needed
 * for the static list — these are public account links, never credentials.
 */
import type { FastifyInstance } from 'fastify';

import { listPacks, type PackKind } from '../packs.js';

const KINDS: readonly PackKind[] = ['student', 'creator'];

export function registerPackRoutes(app: FastifyInstance): void {
  app.get('/packs', async () => ({
    student: listPacks('student'),
    creator: listPacks('creator'),
  }));

  app.get<{ Params: { kind: string } }>('/packs/:kind', async (request, reply) => {
    const kind = request.params.kind;
    if (!KINDS.includes(kind as PackKind)) {
      reply.code(404);
      return { error: 'unknown_pack', message: `No pack "${kind}". Try "student" or "creator".` };
    }
    return { kind, links: listPacks(kind as PackKind) };
  });
}
