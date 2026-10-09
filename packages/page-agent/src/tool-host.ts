/**
 * The **generic** content-script host for the Action Engine.
 *
 * `host.ts` exposes a fixed method list (`snapshot`/`read`/`click`/…); the agent
 * loop needs *whatever the registry advertises*, so this host forwards a tool
 * name + arguments straight to {@link ToolRegistry.invoke}. One protocol, no
 * drift between the catalogue the model sees and the verbs that can run.
 *
 * It also carries the one path the agent may not take: {@link SUBMIT_MESSAGE_TYPE}
 * presses the page's submit control. That request is only ever sent by the
 * extension's own user-gesture handler — see `user-submit.ts`.
 *
 *   const host = createToolHost();                       // content script
 *   browser.runtime.onMessage.addListener((message, _s, sendResponse) => {
 *     if (host.claims(message)) { void host.handle(message).then(sendResponse); return true; }
 *     return undefined;
 *   });
 */
import type { ActionResult as ToolResult } from '@diggy/shared';
import { createActionAPI } from './action-api.js';
import type { ActionEngine } from './action-api.js';
import { ACTION_MESSAGE_TYPE } from './host.js';
import type { ActionTool, ToolHandlerContext } from './tool-registry.js';
import { findSubmitControl, performUserSubmit } from './user-submit.js';

/** The message `type` a user-initiated submit arrives on. */
export const SUBMIT_MESSAGE_TYPE = 'diggy:submit';

/**
 * Ask for the static tool catalogue (`name`/`description`/`parameters`/
 * `category`). The service worker holds no DOM, so this is how it learns the
 * verbs to advertise to the model without duplicating the list.
 */
export const CATALOG_MESSAGE_TYPE = 'diggy:action-catalog';

/** Ask the page to run one registry tool. */
export interface ToolRequest {
  type: typeof ACTION_MESSAGE_TYPE;
  id: string;
  tool: string;
  args?: Record<string, unknown>;
  /** The user approved a policy `confirm` for this call. */
  approved?: boolean;
}

/** Ask for the tool catalogue. */
export interface CatalogRequest {
  type: typeof CATALOG_MESSAGE_TYPE;
  id: string;
}

/** Ask the page to press its submit control (user gesture only). */
export interface SubmitRequest {
  type: typeof SUBMIT_MESSAGE_TYPE;
  id: string;
}

export interface ToolResponse {
  id: string;
  ok: boolean;
  /** The tool's contract result (`{ ok, extractedContent, data, error }`). */
  result?: ToolResult;
  /** For a submit: which control was pressed. */
  label?: string;
  error?: string;
}

export interface CatalogResponse {
  id: string;
  ok: boolean;
  tools?: ActionTool[];
  error?: string;
}

/** Whatever the host answers with — a tool result or the catalogue. */
export type HostResponse = ToolResponse | CatalogResponse;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function idOf(message: unknown): string {
  const id = (message as { id?: unknown })?.id;
  return typeof id === 'string' ? id : 'unknown';
}

function isToolRequest(message: unknown): message is ToolRequest {
  if (typeof message !== 'object' || message === null) return false;
  const candidate = message as Record<string, unknown>;
  return (
    candidate['type'] === ACTION_MESSAGE_TYPE &&
    typeof candidate['id'] === 'string' &&
    typeof candidate['tool'] === 'string'
  );
}

function isSubmitRequest(message: unknown): message is SubmitRequest {
  if (typeof message !== 'object' || message === null) return false;
  const candidate = message as Record<string, unknown>;
  return candidate['type'] === SUBMIT_MESSAGE_TYPE && typeof candidate['id'] === 'string';
}

function isCatalogRequest(message: unknown): message is CatalogRequest {
  if (typeof message !== 'object' || message === null) return false;
  const candidate = message as Record<string, unknown>;
  return candidate['type'] === CATALOG_MESSAGE_TYPE && typeof candidate['id'] === 'string';
}

export interface ToolHost {
  readonly engine: ActionEngine;
  /** Does this host own the message? */
  claims(message: unknown): boolean;
  handle(message: unknown): Promise<HostResponse>;
  /** The static catalogue the service worker advertises to the model. */
  catalog(): ActionTool[];
}

/**
 * Bind an Action Engine to the tool protocol. Defaults to a fresh engine — a
 * content script has exactly one page, so that is the right default.
 */
export function createToolHost(engine: ActionEngine = createActionAPI()): ToolHost {
  function claims(message: unknown): boolean {
    return isToolRequest(message) || isSubmitRequest(message) || isCatalogRequest(message);
  }

  function catalog(): ActionTool[] {
    return engine.tools.list().map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      category: tool.category,
    }));
  }

  async function handle(message: unknown): Promise<HostResponse> {
    if (isCatalogRequest(message)) {
      return { id: message.id, ok: true, tools: catalog() };
    }

    if (isSubmitRequest(message)) {
      const control = findSubmitControl();
      if (!control) {
        return { id: message.id, ok: false, error: 'No submit button found on this page.' };
      }
      const pressed = performUserSubmit(control);
      const response: ToolResponse = { id: message.id, ok: pressed.ok, label: pressed.label };
      if (pressed.error !== undefined) response.error = pressed.error;
      return response;
    }

    if (!isToolRequest(message)) {
      return { id: idOf(message), ok: false, error: `Not a ${ACTION_MESSAGE_TYPE} request.` };
    }

    const context: ToolHandlerContext = {};
    if (message.approved === true) context.approved = true;

    const result = await engine.tools.invoke(message.tool, asRecord(message.args), context);
    return { id: message.id, ok: result.ok, result };
  }

  return { engine, claims, handle, catalog };
}

/**
 * Adapt a host to a `runtime.onMessage`-style callback. Returns `true` when the
 * message was claimed (the response arrives asynchronously).
 */
export function createToolListener(
  host: ToolHost,
  send: (response: HostResponse) => void,
): (message: unknown) => boolean {
  return (message: unknown): boolean => {
    if (!host.claims(message)) return false;
    void host.handle(message).then(send);
    return true;
  };
}
