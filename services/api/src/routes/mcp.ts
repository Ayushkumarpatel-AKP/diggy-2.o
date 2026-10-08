/**
 * MCP task-delegation routes.
 *
 * Handshake first (`POST /mcp/handshake` with the user Bearer session returns
 * an `x-mcp-token` delegation token), then delegate task-level tools only.
 * Ownership is enforced: a token only ever sees its own user's tasks.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { AppContext } from '../config.js';
import {
  createTaskStore,
  isTaskTool,
  mintDelegationToken,
  TASK_TOOLS,
  verifyDelegationToken,
  type TaskStore,
} from '../mcp.js';
import { requireUser } from './auth.js';

type Json = Record<string, unknown>;

function asObject(value: unknown): Json {
  return value && typeof value === 'object' ? (value as Json) : {};
}

function delegationUser(ctx: AppContext, request: FastifyRequest): string | undefined {
  const header = request.headers['x-mcp-token'];
  const token = Array.isArray(header) ? header[0] : header;
  if (typeof token !== 'string' || !token) return undefined;
  return verifyDelegationToken(token, ctx.config.sessionSecret)?.userId;
}

function requireDelegation(
  ctx: AppContext,
  request: FastifyRequest,
  reply: FastifyReply,
): string | undefined {
  const userId = delegationUser(ctx, request);
  if (!userId) {
    reply.code(401).send({
      error: 'unauthorized',
      message: 'A valid "x-mcp-token" delegation token is required. Start with POST /mcp/handshake.',
    });
    return undefined;
  }
  return userId;
}

export interface McpRoutes {
  store: TaskStore;
}

export function registerMcpRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  store: TaskStore = createTaskStore(),
): McpRoutes {
  // 1. Handshake: trade the user session for a short-lived delegation token.
  app.post('/mcp/handshake', async (request, reply) => {
    const user = requireUser(ctx, request, reply);
    if (!user) return;
    return {
      token: mintDelegationToken(user.id, undefined, ctx.config.sessionSecret),
      tools: [...TASK_TOOLS],
    };
  });

  // 2. The task-level tool manifest (task tools only — never raw primitives).
  app.get('/mcp/tools', async (request, reply) => {
    const userId = requireDelegation(ctx, request, reply);
    if (!userId) return;
    return { tools: [...TASK_TOOLS] };
  });

  // 3. Delegate one task-level tool call.
  app.post<{ Body: Json }>('/mcp/delegate', async (request, reply) => {
    const userId = requireDelegation(ctx, request, reply);
    if (!userId) return;

    const body = asObject(request.body);
    const tool = typeof body.tool === 'string' ? body.tool : '';
    if (!isTaskTool(tool)) {
      reply.code(400);
      return {
        error: 'unknown_tool',
        message: `"${tool || '(missing)'}" is not a delegatable task tool.`,
        tools: [...TASK_TOOLS],
      };
    }
    const task = store.create(userId, tool, asObject(body.input));
    reply.code(201);
    return task;
  });

  // 4. Poll one task / list my tasks.
  app.get<{ Params: { id: string } }>('/mcp/tasks/:id', async (request, reply) => {
    const userId = requireDelegation(ctx, request, reply);
    if (!userId) return;
    const task = store.get(request.params.id);
    if (!task || task.owner !== userId) {
      reply.code(404);
      return { error: 'not_found', message: `No task "${request.params.id}".` };
    }
    return task;
  });

  app.get('/mcp/tasks', async (request, reply) => {
    const userId = requireDelegation(ctx, request, reply);
    if (!userId) return;
    return { tasks: store.list(userId) };
  });

  // 5. Mark a task finished (called by the Diggy-side runner).
  app.post<{ Params: { id: string }; Body: Json }>('/mcp/tasks/:id/complete', async (request, reply) => {
    const userId = requireDelegation(ctx, request, reply);
    if (!userId) return;
    const task = store.get(request.params.id);
    if (!task || task.owner !== userId) {
      reply.code(404);
      return { error: 'not_found', message: `No task "${request.params.id}".` };
    }
    const body = asObject(request.body);
    if (typeof body.error === 'string' && body.error) {
      return store.fail(task.id, body.error);
    }
    return store.complete(task.id, body.result ?? null);
  });

  return { store };
}
