/**
 * The page half of the agent's tool set.
 *
 * `runBrain` runs in the service worker; the Action Engine runs in the page. This
 * is the bridge: it fetches the engine's own tool catalogue over the message
 * boundary (so there is exactly one catalogue and no drift) and turns each entry
 * into a tool the loop can call.
 *
 * The one verb that is *not* a tool here is submit — see `page-agent`'s
 * `user-submit.ts`. `submit()` exists on the bridge for the side panel's
 * user-gesture handler only; the loop is never given it.
 */
import type { ActionResult as ToolResult } from "@diggy/shared";
import {
  ACTION_MESSAGE_TYPE,
  AGENT_ACTION_TOOLS,
  CATALOG_MESSAGE_TYPE,
  SUBMIT_MESSAGE_TYPE,
  registryToAgentTools,
  type ActionTool,
  type AgentToolShape,
  type CatalogResponse,
  type ToolResponse,
} from "@diggy/page-agent";

/** How the bridge reaches the content script. */
export type SendToPage = (message: unknown) => Promise<unknown>;

export interface SubmitOutcome {
  ok: boolean;
  label?: string;
  error?: string;
}

export interface PageBridge {
  /** The engine's static catalogue (empty when no page is reachable). */
  catalog(): Promise<ActionTool[]>;
  /** Run one engine tool. */
  invoke(name: string, args: Record<string, unknown>): Promise<ToolResult>;
  /** Press the page's submit control — user gesture only. */
  submit(): Promise<SubmitOutcome>;
  /** The tools to advertise to the model, curated and JSON-Schema'd. */
  tools(): Promise<AgentToolShape[]>;
}

export function createPageBridge(send: SendToPage): PageBridge {
  let counter = 0;
  const nextId = (): string => `pt_${(counter += 1)}`;

  async function catalog(): Promise<ActionTool[]> {
    try {
      const response = (await send({ type: CATALOG_MESSAGE_TYPE, id: nextId() })) as
        | CatalogResponse
        | undefined;
      return response?.ok ? (response.tools ?? []) : [];
    } catch {
      return [];
    }
  }

  async function invoke(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const response = (await send({
        type: ACTION_MESSAGE_TYPE,
        id: nextId(),
        tool: name,
        args,
      })) as ToolResponse | undefined;
      if (!response) return { ok: false, error: "The page did not respond." };
      if (response.result) return response.result;
      const failed: ToolResult = { ok: false };
      if (response.error !== undefined) failed.error = response.error;
      return failed;
    } catch (error) {
      return {
        ok: false,
        error: `Could not reach the page: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  async function submit(): Promise<SubmitOutcome> {
    try {
      const response = (await send({ type: SUBMIT_MESSAGE_TYPE, id: nextId() })) as
        | ToolResponse
        | undefined;
      if (!response) return { ok: false, error: "The page did not respond." };
      const outcome: SubmitOutcome = { ok: response.ok };
      if (response.label !== undefined) outcome.label = response.label;
      if (response.error !== undefined) outcome.error = response.error;
      return outcome;
    } catch (error) {
      return {
        ok: false,
        error: `Could not reach the page: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  async function tools(): Promise<AgentToolShape[]> {
    const catalogue = await catalog();
    if (catalogue.length === 0) return [];
    return registryToAgentTools(catalogue, invoke, AGENT_ACTION_TOOLS);
  }

  return { catalog, invoke, submit, tools };
}
