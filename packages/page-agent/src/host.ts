/**
 * The content-script **host** for the Action Engine.
 *
 * This is the `policy-host` / `agent-host` glue pattern applied to the act
 * layer: the durable engine (`createActionAPI`) is otherwise pure; this module
 * adapts it to a message boundary so the extension's service worker, side panel
 * or offscreen document can drive it with a single `{ type: 'diggy:action' }`
 * message.
 *
 * It deliberately does **not** import `chrome`/`browser`: the package stays
 * dependency-free and jsdom-testable. The extension wires the browser's message
 * event to {@link createActionListener} (see the INTERFACE block).
 *
 * A gated step is never silently approved: `execute` only approves when the
 * caller passes `approve: true`, which the host must set after the user taps
 * Confirm. A submit step is refused by the engine regardless.
 *
 * `// INTERFACE FOR INTEGRATION` — for `apps/extension` (owned by core):
 *
 *   import { createActionHost, createActionListener, ACTION_MESSAGE_TYPE } from '@diggy/page-agent';
 *
 *   const host = createActionHost();               // one per content script / page
 *   browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
 *     if (!message || message.type !== ACTION_MESSAGE_TYPE) return undefined;
 *     void host.handle(message).then(sendResponse);
 *     return true;                                 // keep the channel open
 *   });
 */
import type { Plan } from '@diggy/shared';
import { createActionAPI } from './action-api.js';
import type { ActionEngine } from './action-api.js';
import type { PlanExecutionOptions } from './plan.js';

/** The message `type` the host answers. */
export const ACTION_MESSAGE_TYPE = 'diggy:action';

/** Every ActionAPI method the host can dispatch. */
export type ActionMethod =
  | 'snapshot'
  | 'read'
  | 'click'
  | 'type'
  | 'navigate'
  | 'extract'
  | 'fill'
  | 'plan'
  | 'execute';

const METHODS: ReadonlySet<string> = new Set<ActionMethod>([
  'snapshot',
  'read',
  'click',
  'type',
  'navigate',
  'extract',
  'fill',
  'plan',
  'execute',
]);

/** A request from the host to the engine. */
export interface ActionRequest {
  type: typeof ACTION_MESSAGE_TYPE;
  id: string;
  method: ActionMethod;
  /** Method parameters: `target`, `text`, `url`, `query`, `fields`, or a `Plan`. */
  params?: unknown;
  /** For `execute`: the user approved the gated steps of the plan. */
  approve?: boolean;
}

/** The host's reply. `status` carries the plan-run status for `execute`. */
export interface ActionResponse {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
  status?: string;
}

/** A bound host: the engine plus its message handler. */
export interface ActionHost {
  readonly engine: ActionEngine;
  handle(message: unknown): Promise<ActionResponse>;
}

function isActionRequest(message: unknown): message is ActionRequest {
  if (typeof message !== 'object' || message === null) return false;
  const candidate = message as Record<string, unknown>;
  return (
    candidate['type'] === ACTION_MESSAGE_TYPE &&
    typeof candidate['id'] === 'string' &&
    typeof candidate['method'] === 'string' &&
    METHODS.has(candidate['method'])
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function fail(id: string, error: string): ActionResponse {
  return { id, ok: false, error };
}

/**
 * Bind an Action Engine to the message protocol. Defaults to a fresh engine
 * (one page, one content script).
 */
export function createActionHost(engine: ActionEngine = createActionAPI()): ActionHost {
  async function handle(message: unknown): Promise<ActionResponse> {
    if (!isActionRequest(message)) {
      return fail(
        typeof (message as { id?: unknown })?.id === 'string'
          ? String((message as { id: string }).id)
          : 'unknown',
        `Not a ${ACTION_MESSAGE_TYPE} request.`,
      );
    }

    const { id, method } = message;
    const params = asRecord(message.params);

    try {
      switch (method) {
        case 'snapshot':
          return { id, ok: true, result: await engine.snapshot() };
        case 'read':
          return { id, ok: true, result: await engine.read(typeof params['target'] === 'string' ? params['target'] : undefined) };
        case 'click':
          return { id, ok: true, result: await engine.click(String(params['target'] ?? '')) };
        case 'type':
          return { id, ok: true, result: await engine.type(String(params['target'] ?? ''), String(params['text'] ?? '')) };
        case 'navigate':
          return { id, ok: true, result: await engine.navigate(String(params['url'] ?? '')) };
        case 'extract':
          return { id, ok: true, result: await engine.extract(String(params['query'] ?? '')) };
        case 'fill':
          return { id, ok: true, result: await engine.fill(asRecord(params['fields']) as Record<string, string>) };
        case 'plan':
          return { id, ok: true, result: await engine.plan(String(params['goal'] ?? '')) };
        case 'execute': {
          const plan = message.params as Plan;
          const options: PlanExecutionOptions = message.approve === true ? { approve: () => true } : {};
          const results = await engine.execute(plan, options);
          return { id, ok: true, result: results, status: results.length > 0 ? 'executed' : 'empty' };
        }
        default:
          return fail(id, `Unsupported method "${String(method)}".`);
      }
    } catch (error) {
      return fail(id, error instanceof Error ? error.message : String(error));
    }
  }

  return { engine, handle };
}

/**
 * Adapt a host to a `runtime.onMessage`-style callback.
 *
 * `send` is the browser's `sendResponse`. The returned boolean is the "keep the
 * channel open" flag: `true` when the listener claimed the message (the response
 * arrives asynchronously), `false` otherwise so other listeners can run.
 */
export function createActionListener(
  host: ActionHost,
  send: (response: ActionResponse) => void,
): (message: unknown) => boolean {
  return (message: unknown): boolean => {
    if (!isActionRequest(message)) return false;
    void host.handle(message).then(send);
    return true;
  };
}
