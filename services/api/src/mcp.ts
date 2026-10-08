/**
 * MCP task-delegation server (webbrain concept, Diggy policy-gated).
 *
 * A coding agent (or any MCP client) can delegate *browser tasks* to Diggy
 * without ever touching raw page primitives:
 *
 *   1. `POST /mcp/handshake` with the user's Bearer session → a short-lived
 *      **delegation token** (HMAC, bound to that user, 1h TTL).
 *   2. `POST /mcp/delegate` with `x-mcp-token` → creates a task for one of the
 *      **task-level tools** below and returns its id.
 *   3. `GET /mcp/tasks/:id` (same token) → poll status/result.
 *
 * Task-level tools only — never raw primitives (`fetch`, `eval`, `click`,
 * `submit`) that would bypass the `@diggy/policy` gate. Execution itself stays
 * inside Diggy (page-agent + policy); this module is the handshake + ledger.
 *
 * // INTERFACE FOR INTEGRATION
 * TASK_TOOLS: readonly string[]            // the only delegatable tools
 * createTaskStore(): TaskStore
 * mintDelegationToken(userId, secret?): string
 * verifyDelegationToken(token, secret?): { userId } | undefined
 * // END INTERFACE FOR INTEGRATION
 */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

import { getContext } from './config.js';

/**
 * The only tools a delegated agent may request. Each maps to a Diggy-side
 * capability that already passes the policy gate (never auto-submit, sensitive
 * sites blocked, human approval for irreversible actions).
 */
export const TASK_TOOLS = [
  'browser.navigate',
  'browser.snapshot',
  'page.extract',
  'page.summarize',
  'monitor.watch_create',
  'gmail.search',
  'calendar.read',
  'calendar.create',
  'youtube.latest',
  'notion.search',
] as const;

export type TaskTool = (typeof TASK_TOOLS)[number];

export function isTaskTool(tool: string): tool is TaskTool {
  return (TASK_TOOLS as readonly string[]).includes(tool);
}

export type DelegatedTaskStatus = 'queued' | 'running' | 'done' | 'failed';

export interface DelegatedTask {
  id: string;
  tool: TaskTool;
  input: Record<string, unknown>;
  status: DelegatedTaskStatus;
  result?: unknown;
  error?: string;
  owner: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskStore {
  create(owner: string, tool: TaskTool, input: Record<string, unknown>): DelegatedTask;
  get(id: string): DelegatedTask | undefined;
  list(owner: string): DelegatedTask[];
  complete(id: string, result: unknown): DelegatedTask | undefined;
  fail(id: string, error: string): DelegatedTask | undefined;
  clear(): void;
}

export function createTaskStore(): TaskStore {
  const tasks = new Map<string, DelegatedTask>();
  const now = (): string => new Date().toISOString();

  return {
    create(owner, tool, input) {
      const task: DelegatedTask = {
        id: randomUUID(),
        tool,
        input,
        status: 'queued',
        owner,
        createdAt: now(),
        updatedAt: now(),
      };
      tasks.set(task.id, task);
      return task;
    },
    get(id) {
      return tasks.get(id);
    },
    list(owner) {
      return [...tasks.values()].filter((task) => task.owner === owner);
    },
    complete(id, result) {
      const task = tasks.get(id);
      if (!task) return undefined;
      task.status = 'done';
      task.result = result;
      task.updatedAt = now();
      return task;
    },
    fail(id, error) {
      const task = tasks.get(id);
      if (!task) return undefined;
      task.status = 'failed';
      task.error = error;
      task.updatedAt = now();
      return task;
    },
    clear() {
      tasks.clear();
    },
  };
}

/** Delegation tokens live 1 hour — long enough to delegate, too short to hoard. */
export const DELEGATION_TTL_MS = 60 * 60 * 1000;

interface DelegationPayload {
  u: string;
  exp: number;
  scope: 'delegate';
}

function hmac(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function secretFromDefault(): string {
  return getContext().config.sessionSecret;
}

/** Mint a delegation token for `userId` (present as `x-mcp-token`). */
export function mintDelegationToken(
  userId: string,
  ttlMs: number = DELEGATION_TTL_MS,
  secret: string = secretFromDefault(),
): string {
  const payload: DelegationPayload = { u: userId, exp: Date.now() + ttlMs, scope: 'delegate' };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `mcp.${encoded}.${hmac(encoded, secret)}`;
}

/** Verify a delegation token. Returns the bound user, or `undefined`. */
export function verifyDelegationToken(
  token: string,
  secret: string = secretFromDefault(),
): { userId: string; expiresAt: number } | undefined {
  if (!token.startsWith('mcp.')) return undefined;
  const rest = token.slice('mcp.'.length);
  const dot = rest.lastIndexOf('.');
  if (dot <= 0 || dot === rest.length - 1) return undefined;
  const encoded = rest.slice(0, dot);
  const signature = rest.slice(dot + 1);

  const expected = hmac(encoded, secret);
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return undefined;

  let payload: DelegationPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as DelegationPayload;
  } catch {
    return undefined;
  }
  if (payload.scope !== 'delegate' || typeof payload.u !== 'string') return undefined;
  if (typeof payload.exp !== 'number' || payload.exp <= Date.now()) return undefined;
  return { userId: payload.u, expiresAt: payload.exp };
}
