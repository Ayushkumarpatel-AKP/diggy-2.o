/**
 * Calendar download routes.
 *
 * `GET /calendar/export` returns the user's upcoming Google Calendar events as
 * a downloadable `.ics` file (`text/calendar`). This is the `.ics` export
 * fallback for users who want their schedule outside Diggy — read path only,
 * authenticated with the session Bearer token.
 */
import type { FastifyInstance } from 'fastify';

import type { AppContext } from '../config.js';
import { buildIcs } from '../ics.js';
import { readCalendarEvents, HttpError } from './actions.js';
import { requireUser } from './auth.js';

interface ExportQuery {
  days?: string;
}

export function registerCalendarRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get<{ Querystring: ExportQuery }>(
    '/calendar/export',
    async (request, reply) => {
      const user = requireUser(ctx, request, reply);
      if (!user) return;

      const days = request.query.days !== undefined ? Number(request.query.days) : 7;
      try {
        const { events } = await readCalendarEvents(ctx, user.id, { days });
        const ics = buildIcs(
          events.map((event) => ({
            id: event.id,
            summary: event.summary,
            start: event.start,
            end: event.end,
            location: event.location,
            url: event.url,
          })),
        );
        reply.type('text/calendar; charset=utf-8');
        reply.header('Content-Disposition', 'attachment; filename="diggy-calendar.ics"');
        return ics;
      } catch (error) {
        if (error instanceof HttpError) {
          reply.code(error.status);
          return { error: error.code, message: error.message };
        }
        reply.code(500);
        return { error: 'internal_error', message: error instanceof Error ? error.message : String(error) };
      }
    },
  );
}
