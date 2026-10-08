import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createContext, type AppContext } from '../src/config.js';
import { SESSION_TTL_MS, signSession } from '../src/crypto.js';
import { upsertUser, type UserRow } from '../src/db.js';
import { buildIcs } from '../src/ics.js';
import { buildServer } from '../src/server.js';
import { inject } from './helpers.js';

const ctx: AppContext = createContext({ dbPath: ':memory:', env: {} });
const app = buildServer({ context: ctx });

let user: UserRow;
let token: string;

beforeAll(() => {
  user = upsertUser(ctx.db, {
    id: randomUUID(),
    googleSub: 'ics-sub-1',
    email: 'ada@example.com',
    name: 'Ada Lovelace',
    picture: null,
  });
  token = signSession(user.id, SESSION_TTL_MS, ctx.config.sessionSecret);
});

afterAll(async () => {
  await app.close();
});

function authHeader(value: string): { authorization: string } {
  return { authorization: `Bearer ${value}` };
}

describe('buildIcs', () => {
  it('produces a valid VCALENDAR with datetime + all-day events', () => {
    const ics = buildIcs([
      {
        id: 'evt-1',
        summary: 'Team standup, weekly; bring coffee',
        start: '2026-03-01T10:00:00Z',
        end: '2026-03-01T10:30:00Z',
        location: 'Room 1, Floor 2',
      },
      { id: 'evt-2', summary: 'SIH finale', start: '2026-03-02' },
    ]);

    const lines = ics.replace(/\r\n /g, '').split('\r\n');
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines).toContain('VERSION:2.0');
    expect(lines).toContain('END:VCALENDAR');
    expect(lines.filter((line) => line === 'BEGIN:VEVENT')).toHaveLength(2);
    expect(lines.filter((line) => line === 'END:VEVENT')).toHaveLength(2);
    expect(lines).toContain('UID:evt-1');
    expect(lines).toContain('DTSTART:20260301T100000Z');
    expect(lines).toContain('DTEND:20260301T103000Z');
    // RFC 5545 escaping: commas and semicolons are backslash-escaped.
    expect(lines).toContain('SUMMARY:Team standup\\, weekly\\; bring coffee');
    expect(lines).toContain('LOCATION:Room 1\\, Floor 2');
    // All-day events use VALUE=DATE.
    expect(lines).toContain('DTSTART;VALUE=DATE:20260302');
  });

  it('always returns at least a valid empty calendar', () => {
    const ics = buildIcs([]);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).not.toContain('BEGIN:VEVENT');
  });

  it('skips events with unparseable dates instead of emitting garbage', () => {
    const ics = buildIcs([{ summary: 'bad', start: 'not-a-date' }]);
    expect(ics).not.toContain('BEGIN:VEVENT');
  });
});

describe('google/calendar.export action', () => {
  it('builds .ics from an explicit events array (no connection needed)', async () => {
    const response = await inject(app, {
      method: 'POST',
      url: '/actions/google/calendar.export',
      headers: authHeader(token),
      payload: {
        events: [{ id: 'a1', summary: 'Demo day', start: '2026-04-01T09:00:00Z' }],
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { ics: string; count: number };
    expect(body.count).toBe(1);
    expect(body.ics).toContain('BEGIN:VCALENDAR');
    expect(body.ics).toContain('SUMMARY:Demo day');
    expect(body.ics).toContain('END:VCALENDAR');
  });

  it('requires a session', async () => {
    const response = await inject(app, {
      method: 'POST',
      url: '/actions/google/calendar.export',
      payload: { events: [] },
    });
    expect(response.statusCode).toBe(401);
  });
});

describe('GET /calendar/export', () => {
  it('409s when Google is not connected (nothing to export)', async () => {
    const response = await inject(app, {
      method: 'GET',
      url: '/calendar/export',
      headers: authHeader(token),
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: 'not_connected' });
  });
});
