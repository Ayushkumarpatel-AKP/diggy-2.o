/**
 * Packs (student/creator, link-only), the pluggable connector registry and the
 * MCP task-delegation handshake. Offline — all through `fastify.inject`.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getPackLink, listPacks } from '../src/packs.js';
import {
  getConnector,
  listConnectors,
  registerConnector,
  resetConnectors,
  unregisterConnector,
} from '../src/connectors.js';
import { createContext, type AppContext } from '../src/config.js';
import { SESSION_TTL_MS, signSession } from '../src/crypto.js';
import { upsertUser, type UserRow } from '../src/db.js';
import {
  mintDelegationToken,
  verifyDelegationToken,
  TASK_TOOLS,
} from '../src/mcp.js';
import { buildServer } from '../src/server.js';
import { inject } from './helpers.js';

const ctx: AppContext = createContext({ dbPath: ':memory:', env: {} });
const app = buildServer({ context: ctx });

let user: UserRow;
let token: string;
let otherToken: string;

beforeAll(() => {
  user = upsertUser(ctx.db, {
    id: randomUUID(),
    googleSub: 'packs-sub-1',
    email: 'ada@example.com',
    name: 'Ada Lovelace',
    picture: null,
  });
  token = signSession(user.id, SESSION_TTL_MS, ctx.config.sessionSecret);

  const other = upsertUser(ctx.db, {
    id: randomUUID(),
    googleSub: 'packs-sub-2',
    email: 'grace@example.com',
    name: 'Grace Hopper',
    picture: null,
  });
  otherToken = signSession(other.id, SESSION_TTL_MS, ctx.config.sessionSecret);
});

afterAll(async () => {
  resetConnectors();
  await app.close();
});

describe('packs registry', () => {
  it('lists the student pack (SIH, LeetCode, Codeforces, hackathons, scholarships)', () => {
    const ids = listPacks('student').map((link) => link.id);
    expect(ids).toEqual(['sih', 'leetcode', 'codeforces', 'hackathons', 'scholarships']);
  });

  it('lists the creator pack (YouTube, LinkedIn, X, Reddit)', () => {
    const ids = listPacks('creator').map((link) => link.id);
    expect(ids).toEqual(['youtube-studio', 'linkedin', 'x', 'reddit']);
  });

  it('is link-only — never credentials', () => {
    for (const link of listPacks()) {
      expect(link.auth).toBe('link');
      expect(link.url).toMatch(/^https:\/\//);
    }
    expect(getPackLink('sih')?.url).toContain('sih.gov.in');
  });

  it('GET /packs serves both packs without auth', async () => {
    const response = await inject(app, { method: 'GET', url: '/packs' });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { student: unknown[]; creator: unknown[] };
    expect(body.student).toHaveLength(5);
    expect(body.creator).toHaveLength(4);
  });

  it('GET /packs/:kind serves one pack and 404s unknown kinds', async () => {
    const student = await inject(app, { method: 'GET', url: '/packs/student' });
    expect(student.statusCode).toBe(200);
    expect((student.json() as { links: unknown[] }).links).toHaveLength(5);

    const missing = await inject(app, { method: 'GET', url: '/packs/nope' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ error: 'unknown_pack' });
  });
});

describe('connector registry', () => {
  it('seeds built-ins from providers + packs + crawler', () => {
    const ids = listConnectors().map((connector) => connector.id);
    for (const expected of ['google', 'notion', 'github', 'youtube', 'leetcode', 'sih', 'crawler']) {
      expect(ids).toContain(expected);
    }
    expect(getConnector('google')?.actions).toContain('gmail.list');
    expect(getConnector('leetcode')?.kind).toBe('link');
  });

  it('rejects duplicate registration and supports unregister', () => {
    expect(() =>
      registerConnector({ id: 'google', name: 'Google', description: 'dup', kind: 'oauth', actions: [] }),
    ).toThrow(/already registered/);

    registerConnector({ id: 'custom', name: 'Custom', description: 'third-party', kind: 'local', actions: ['custom.run'] });
    expect(getConnector('custom')?.actions).toEqual(['custom.run']);
    expect(unregisterConnector('custom')).toBe(true);
    expect(getConnector('custom')).toBeUndefined();
  });

  it('GET /connectors lists the registry without auth', async () => {
    const response = await inject(app, { method: 'GET', url: '/connectors' });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { connectors: { id: string }[] };
    expect(body.connectors.length).toBeGreaterThan(10);
  });

  it('GET /connectors/:id serves one connector and 404s unknown ids', async () => {
    const google = await inject(app, { method: 'GET', url: '/connectors/google' });
    expect(google.statusCode).toBe(200);
    expect(google.json()).toMatchObject({ id: 'google', kind: 'oauth' });

    const missing = await inject(app, { method: 'GET', url: '/connectors/nope' });
    expect(missing.statusCode).toBe(404);
  });
});

describe('MCP delegation tokens', () => {
  it('mints and verifies, and rejects wrong-secret/expired/forged tokens', () => {
    const secret = ctx.config.sessionSecret;
    const delegation = mintDelegationToken(user.id, undefined, secret);
    expect(delegation.startsWith('mcp.')).toBe(true);
    expect(verifyDelegationToken(delegation, secret)?.userId).toBe(user.id);

    expect(verifyDelegationToken(delegation, 'wrong-secret')).toBeUndefined();
    expect(verifyDelegationToken('not-a-token', secret)).toBeUndefined();
    expect(verifyDelegationToken(mintDelegationToken(user.id, -1, secret), secret)).toBeUndefined();
  });
});

describe('MCP task-delegation routes', () => {
  async function handshake(session: string): Promise<string> {
    const response = await inject(app, {
      method: 'POST',
      url: '/mcp/handshake',
      headers: { authorization: `Bearer ${session}` },
      payload: {},
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { token: string; tools: string[] };
    expect(body.tools).toEqual([...TASK_TOOLS]);
    return body.token;
  }

  function mcpHeaders(delegation: string): Record<string, string> {
    return { 'x-mcp-token': delegation };
  }

  it('requires a user session for the handshake', async () => {
    const response = await inject(app, { method: 'POST', url: '/mcp/handshake', payload: {} });
    expect(response.statusCode).toBe(401);
  });

  it('delegates, polls and completes a task-level tool', async () => {
    const delegation = await handshake(token);

    const tools = await inject(app, { method: 'GET', url: '/mcp/tools', headers: mcpHeaders(delegation) });
    expect(tools.statusCode).toBe(200);
    const toolList = (tools.json() as { tools: string[] }).tools;
    expect(toolList).toContain('page.extract');
    // Task-level tools only — never raw primitives.
    for (const raw of ['fetch', 'eval', 'click', 'submit']) {
      expect(toolList).not.toContain(raw);
    }

    const delegated = await inject(app, {
      method: 'POST',
      url: '/mcp/delegate',
      headers: mcpHeaders(delegation),
      payload: { tool: 'page.extract', input: { url: 'https://example.com' } },
    });
    expect(delegated.statusCode).toBe(201);
    const task = delegated.json() as { id: string; status: string; tool: string };
    expect(task.status).toBe('queued');
    expect(task.tool).toBe('page.extract');

    const polled = await inject(app, {
      method: 'GET',
      url: `/mcp/tasks/${task.id}`,
      headers: mcpHeaders(delegation),
    });
    expect(polled.statusCode).toBe(200);
    expect(polled.json()).toMatchObject({ id: task.id, status: 'queued' });

    const done = await inject(app, {
      method: 'POST',
      url: `/mcp/tasks/${task.id}/complete`,
      headers: mcpHeaders(delegation),
      payload: { result: { title: 'Example' } },
    });
    expect(done.statusCode).toBe(200);
    expect(done.json()).toMatchObject({ status: 'done', result: { title: 'Example' } });
  });

  it('rejects raw primitives that bypass the policy gate', async () => {
    const delegation = await handshake(token);
    const response = await inject(app, {
      method: 'POST',
      url: '/mcp/delegate',
      headers: mcpHeaders(delegation),
      payload: { tool: 'fetch', input: { url: 'https://evil.com' } },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'unknown_tool' });
  });

  it('rejects requests without a delegation token', async () => {
    const response = await inject(app, { method: 'GET', url: '/mcp/tools' });
    expect(response.statusCode).toBe(401);
  });

  it('isolates tasks per user', async () => {
    const mine = await handshake(token);
    const theirs = await handshake(otherToken);

    const delegated = await inject(app, {
      method: 'POST',
      url: '/mcp/delegate',
      headers: mcpHeaders(mine),
      payload: { tool: 'gmail.search', input: { query: 'invoice' } },
    });
    const task = delegated.json() as { id: string };

    const foreign = await inject(app, {
      method: 'GET',
      url: `/mcp/tasks/${task.id}`,
      headers: mcpHeaders(theirs),
    });
    expect(foreign.statusCode).toBe(404);
  });
});
