/**
 * OAuth callback test: completing the provider redirect stores the tokens
 * **encrypted** in the database — never plaintext.
 *
 * Fully offline: `globalThis.fetch` is stubbed for the provider token + profile
 * endpoints, and the request is driven through `fastify.inject`.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createContext, type AppContext } from '../src/config.js';
import { decryptString, SESSION_TTL_MS, signSession } from '../src/crypto.js';
import { getConnection, upsertUser, type UserRow } from '../src/db.js';
import { buildServer } from '../src/server.js';
import { inject } from './helpers.js';

const ACCESS_TOKEN = 'gho_test-access-token-abcdef123456';
const ACCOUNT_LOGIN = 'octocat';

const ctx: AppContext = createContext({
  dbPath: ':memory:',
  env: {
    GITHUB_CLIENT_ID: 'test-github-client-id',
    GITHUB_CLIENT_SECRET: 'test-github-client-secret',
  },
});
const app = buildServer({ context: ctx });

let user: UserRow;
let session: string;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeAll(() => {
  user = upsertUser(ctx.db, {
    id: randomUUID(),
    googleSub: 'github-oauth-sub-1',
    email: 'ada@example.com',
    name: 'Ada Lovelace',
    picture: null,
  });
  session = signSession(user.id, SESSION_TTL_MS, ctx.config.sessionSecret);

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown, init?: { headers?: Record<string, string> }) => {
      const target = String(url);
      if (target === 'https://github.com/login/oauth/access_token') {
        expect(init?.headers?.['content-type']).toContain('application/x-www-form-urlencoded');
        return jsonResponse({ access_token: ACCESS_TOKEN, scope: 'read:user repo', token_type: 'bearer' });
      }
      if (target === 'https://api.github.com/user') {
        expect(init?.headers?.authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
        return jsonResponse({ login: ACCOUNT_LOGIN });
      }
      throw new Error(`Unexpected fetch in test: ${target}`);
    }),
  );
});

afterEach(() => {
  vi.clearAllMocks();
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await app.close();
});

function encodeState(sessionToken: string): string {
  return Buffer.from(JSON.stringify({ session: sessionToken }), 'utf8').toString('base64url');
}

describe('OAuth callback stores an encrypted token', () => {
  it('exchanges the code and persists ciphertext (never plaintext)', async () => {
    const state = encodeState(session);
    const response = await inject(app, {
      method: 'GET',
      url: `/oauth/github/callback?code=authcode-123&state=${encodeURIComponent(state)}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');

    const row = getConnection(ctx.db, user.id, 'github');
    expect(row).toBeDefined();
    expect(row?.account_label).toBe(ACCOUNT_LOGIN);
    // Ciphertext at rest: present, but never the raw secret.
    expect(row?.access_token_ct).toBeTruthy();
    expect(row?.access_token_ct).not.toContain(ACCESS_TOKEN);
    // …and it decrypts back to exactly what the provider issued.
    expect(decryptString(row?.access_token_ct ?? '', ctx.config.tokenKey)).toBe(ACCESS_TOKEN);
  });

  it('marks the provider connected in /api/plugins afterwards', async () => {
    const response = await inject(app, {
      method: 'GET',
      url: '/api/plugins',
      headers: { authorization: `Bearer ${session}` },
    });
    expect(response.statusCode).toBe(200);
    const plugins = response.json() as { id: string; connected: boolean; accountLabel?: string }[];
    expect(plugins.find((plugin) => plugin.id === 'github')).toMatchObject({
      connected: true,
      accountLabel: ACCOUNT_LOGIN,
    });
  });

  it('rejects a callback with a forged state token', async () => {
    const response = await inject(app, {
      method: 'GET',
      url: `/oauth/github/callback?code=authcode-123&state=${encodeURIComponent(encodeState('forged.session.token'))}`,
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: 'unauthorized' });
  });
});
