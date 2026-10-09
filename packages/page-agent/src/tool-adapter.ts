/**
 * Bridge the Action Engine's catalogue to the **agent loop's** tool shape.
 *
 * `runBrain` wants `{ schema, run }` where `schema.parameters` is a JSON Schema;
 * the registry speaks a friendlier `ToolParameter[]`. This module is that single
 * conversion, plus the `ToolResult` → model-facing payload shaping.
 *
 * It deliberately declares its own `AgentToolShape` instead of importing
 * `AgentTool` from `@diggy/core`: this package runs in the **content script**,
 * and importing the model layer would drag the provider/registry code into the
 * page bundle. The shapes are structurally identical, so the result is directly
 * assignable to `AgentTool`.
 *
 * The run function is injected rather than assumed: the tools execute in the
 * page, but the loop runs in the service worker, so the caller supplies an
 * `invoke` that crosses that boundary (see `apps/extension/src/page-tools.ts`).
 */
import type { ActionResult as ToolResult, ToolSchema } from '@diggy/shared';
import type { RegisteredTool, ToolParameter } from './tool-registry.js';

/** The loop's per-tool context. Structurally identical to `@diggy/core`'s. */
export interface AgentToolContext {
  stepIndex: number;
  signal: AbortSignal | undefined;
}

/** A tool the agent loop can call. Structurally identical to `AgentTool`. */
export interface AgentToolShape {
  schema: ToolSchema;
  run: (args: Record<string, unknown>, context: AgentToolContext) => unknown | Promise<unknown>;
}

/** Run a tool by name somewhere else (the content script, in the extension). */
export type ToolInvoker = (
  name: string,
  args: Record<string, unknown>,
) => Promise<ToolResult>;

/** Turn a tool's parameter list into the JSON Schema the model is given. */
export function paramsToJsonSchema(
  params: readonly ToolParameter[],
): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const param of params) {
    const property: Record<string, unknown> = {
      type: param.type,
      description: param.description,
    };
    if (param.type === 'object') property['additionalProperties'] = true;
    if (param.type === 'array') property['items'] = {};
    properties[param.name] = property;
    if (param.required === true) required.push(param.name);
  }

  const schema: Record<string, unknown> = { type: 'object', properties };
  if (required.length > 0) schema['required'] = required;
  return schema;
}

/** The `ToolSchema` the loop advertises for a registry tool. */
export function toToolSchema(tool: RegisteredTool): ToolSchema {
  return {
    name: tool.name,
    description: tool.description,
    parameters: paramsToJsonSchema(tool.parameters),
  };
}

/**
 * Keys whose value would only duplicate `extractedContent` (or is far too large
 * to be useful) — dropped from what the model sees.
 */
const NOISY_DATA_KEYS = new Set(['snapshot', 'text']);

function compactData(data: unknown): unknown {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return data;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (NOISY_DATA_KEYS.has(key)) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Shape a tool result for the model: the readable content first, then any small
 * structured data the model can reason over. The loop caps the whole thing.
 */
export function formatToolResult(name: string, result: ToolResult): Record<string, unknown> {
  const out: Record<string, unknown> = { ok: result.ok };

  if (typeof result.extractedContent === 'string' && result.extractedContent !== '') {
    out['content'] = result.extractedContent;
  }
  if (result.data !== undefined) {
    const compact = compactData(result.data);
    if (compact !== undefined && Object.keys(compact as object).length > 0) {
      out['data'] = compact;
    }
  }
  if (result.error !== undefined) out['error'] = result.error;

  if (out['content'] === undefined && out['data'] === undefined && out['error'] === undefined) {
    out['content'] = result.ok ? `${name} succeeded.` : `${name} failed.`;
  }
  return out;
}

/** Wrap one registry tool as a loop tool that delegates to `invoke`. */
export function toAgentTool(tool: RegisteredTool, invoke: ToolInvoker): AgentToolShape {
  return {
    schema: toToolSchema(tool),
    run: async (args) => formatToolResult(tool.name, await invoke(tool.name, args ?? {})),
  };
}

/**
 * Wrap every tool in a registry. Pass `names` to expose a curated subset — a
 * smaller catalogue is markedly easier for a model to pick from correctly.
 */
export function registryToAgentTools(
  tools: readonly RegisteredTool[],
  invoke: ToolInvoker,
  names?: readonly string[],
): AgentToolShape[] {
  const wanted = names ? new Set(names) : null;
  return tools
    .filter((tool) => (wanted ? wanted.has(tool.name) : true))
    .map((tool) => toAgentTool(tool, invoke));
}

/**
 * The registry names the agent is given. Curated from the full catalogue: the
 * act verbs plus the two reads that make a page legible, and `goBack` so a wrong
 * navigation is recoverable. `pressKey` is left out because an `Enter` inside a
 * form is a submit by another name — the user presses those.
 */
export const AGENT_ACTION_TOOLS: readonly string[] = [
  'snapshot',
  'read',
  'extract',
  'click',
  'type',
  'select',
  'fill',
  'scroll',
  'waitFor',
  'navigate',
  'goBack',
];
