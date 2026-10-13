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
import type { PointerEvent } from "./pointer.js";

/** How the bridge reaches the content script. */
export type SendToPage = (message: unknown) => Promise<unknown>;

/**
 * Host pre-authorization for in-page writes.
 *
 * The page's own gate confirms a write whenever the session is tainted — which
 * is always after the first snapshot — and nothing in the page can answer it.
 * The host (which already enforces navigation, send and site policy for this
 * run) answers instead: `approved: true` means "this write is part of the
 * user's explicit task". A refusal must explain why, and the page is never
 * touched in that case.
 */
export type PageWritePolicy = (
  tool: string,
  args: Record<string, unknown>,
  tabId: number | undefined,
) => Promise<{ approved: boolean; error?: string }>;

/**
 * Writes whose in-page gate may demand confirmation. Reads need none, and
 * `submit` is deliberately absent: nothing here may ever approve a submit.
 */
const HOST_GATED_TOOLS: ReadonlySet<string> = new Set([
  "click",
  "type",
  "select",
  "fill",
  "pressKey",
  "navigate",
]);

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
  /**
   * Aim the tools at one tab. `undefined` sends them back to the focused tab.
   *
   * The chosen id travels on every request, so the background routes it to the
   * tab the model picked instead of re-reading whichever tab happens to be
   * active at call time.
   */
  target(tabId: number | undefined): void;
  /** The tab the tools act on, or undefined when they follow the active tab. */
  targetTabId(): number | undefined;
  /**
   * Show the user where an action landed. Visual only, fire-and-forget: it is
   * driven exclusively by real tool results, so it cannot show a fake action.
   */
  pointer(event: PointerEvent): void;
}

export function createPageBridge(send: SendToPage, policy?: PageWritePolicy): PageBridge {
  let counter = 0;
  let aimedTabId: number | undefined;
  const nextId = (): string => `pt_${(counter += 1)}`;

  /** Attach the target tab, when one has been chosen, to an outgoing message. */
  function withTarget(fields: Record<string, unknown>): Record<string, unknown> {
    return aimedTabId === undefined ? fields : { ...fields, tabId: aimedTabId };
  }

  function target(tabId: number | undefined): void {
    aimedTabId = tabId;
  }

  function targetTabId(): number | undefined {
    return aimedTabId;
  }

  /** Fire-and-forget: the overlay is a nicety, never a reason to fail a run. */
  function pointer(event: PointerEvent): void {
    void Promise.resolve(
      send(withTarget({ type: "diggy:pointer", ...event })),
    ).catch(() => undefined);
  }

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
    // Pre-authorize writes so the in-page taint-confirm has an answer. Reads
    // skip this entirely; anything refused here never reaches the page.
    let approved = false;
    if (policy && HOST_GATED_TOOLS.has(name)) {
      let verdict: { approved: boolean; error?: string };
      try {
        verdict = await policy(name, args, aimedTabId);
      } catch {
        verdict = { approved: false, error: "The page-write policy check failed." };
      }
      if (!verdict.approved) {
        const blocked: ToolResult = { ok: false };
        if (verdict.error !== undefined) blocked.error = verdict.error;
        return blocked;
      }
      approved = true;
    }
    try {
      const outgoing: Record<string, unknown> = withTarget({
        type: ACTION_MESSAGE_TYPE,
        id: nextId(),
        tool: name,
        args,
      });
      if (approved) outgoing["approved"] = true;
      const response = (await send(outgoing)) as ToolResponse | undefined;
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
      const response = (await send(
        withTarget({ type: SUBMIT_MESSAGE_TYPE, id: nextId() }),
      )) as ToolResponse | undefined;
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

  return { catalog, invoke, submit, tools, target, targetTabId, pointer };
}
