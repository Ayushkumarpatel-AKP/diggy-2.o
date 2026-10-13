/**
 * The Diggy agent loop — plan → act → observe → repeat.
 *
 * Provider-agnostic: the loop only needs something that answers a `ChatRequest`
 * (a single `Provider`, or the `FailoverRegistry` so failover is transparent).
 *
 * A run is bounded by a **step budget** (default 130, hard cap 195). When the
 * budget is hit the run stops cleanly, writes a checkpoint, and surfaces a
 * {@link ContinueSignal} — the host can resume from exactly where it stopped by
 * passing `resume: result.checkpoint`. Nothing is lost and no step repeats.
 */
import type { ChatMessage, ChatRequest, ChatResult, ToolCall, ToolSchema } from "@diggy/shared";
import { BRAIN, CONTEXT, type AgentMode } from "./config.js";
import { capToolResult, compactWithOverflowRecovery, limitToolResults, totalTokens } from "./memory/compaction.js";
import { buildSystemPrompt, normalizeMode, temperatureFor, type PromptLayer } from "./prompt.js";

/** Anything that can answer a chat request — a `Provider` or the registry. */
export interface BrainModel {
  chat(req: ChatRequest): Promise<ChatResult>;
}

export interface ToolRunContext {
  stepIndex: number;
  signal: AbortSignal | undefined;
}

/** A tool the loop may execute. The Action Engine supplies these from outside. */
export interface AgentTool {
  schema: ToolSchema;
  run: (args: Record<string, unknown>, context: ToolRunContext) => unknown | Promise<unknown>;
}

export interface Observation {
  toolCall: ToolCall;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface AgentStep {
  index: number;
  text: string;
  toolCalls: ToolCall[];
  finishReason: ChatResult["finishReason"];
  observations: Observation[];
}

export interface BrainPlan {
  goal: string;
  steps: string[];
  raw: string;
}

export interface BrainCheckpoint {
  goal: string;
  stepIndex: number;
  messages: ChatMessage[];
  plan: BrainPlan | null;
  createdAt: string;
}

/** The signal that a run stopped at the budget and can be continued. */
export interface ContinueSignal {
  continue: true;
  reason: "step-budget" | "wall-clock";
  stepIndex: number;
  stepsExecuted: number;
  stepBudget: number;
  /** Short, user-safe sentence containing the word "Continue". */
  message: string;
  checkpoint: BrainCheckpoint;
}

export type BrainRunStatus = "done" | "budget-exceeded" | "cancelled" | "error";

export interface RunBrainResult {
  status: BrainRunStatus;
  goal: string;
  text: string;
  plan: BrainPlan | null;
  steps: AgentStep[];
  stepsExecuted: number;
  stepBudget: number;
  messages: ChatMessage[];
  checkpoint: BrainCheckpoint;
  /** Present when the run stopped at the budget/time limit. */
  continue?: ContinueSignal;
  error?: string;
}

export interface ResolvedStepBudget {
  stepBudget: number;
  hardCap: number;
  requested: number | undefined;
}

/** Clamp a requested step budget into `[1, hardCap]` (default cap 195). */
export function resolveStepBudget(requested?: number, hardCap: number = BRAIN.hardStepBudget): ResolvedStepBudget {
  const cap = Number.isFinite(hardCap) && hardCap > 0 ? Math.floor(hardCap) : BRAIN.hardStepBudget;
  const base =
    requested == null || !Number.isFinite(requested) ? BRAIN.defaultStepBudget : Math.floor(requested);
  return { stepBudget: Math.max(1, Math.min(base, cap)), hardCap: cap, requested };
}

/** The word a host/user replies with to resume a budget-stopped run. */
export const CONTINUE = "Continue";

export const PLANNER_INSTRUCTION = `Before you act, make a short plan for the goal. Reply with JSON only:
{"steps": ["first concrete step", "second step"]}
Keep it to at most 8 steps. Do not call tools yet.`;

export interface RunBrainOptions {
  goal: string;
  model: BrainModel;
  tools?: AgentTool[];
  mode?: AgentMode;
  /** Requested step budget. Clamped to `[1, hardCap]`. Default 130. */
  stepBudget?: number;
  /** Absolute ceiling. Default 195. */
  hardCap?: number;
  maxTokens?: number;
  /** Override the mode temperature. */
  temperature?: number;
  /** Replace the persona entirely. */
  systemPrompt?: string;
  /** Ordered prompt layers (extend/override) applied to the persona. */
  layers?: PromptLayer[];
  /** Host context block. */
  context?: string;
  /** Conversation turns before the goal. */
  history?: ChatMessage[];
  /** Run the plan phase first. Default true. */
  planner?: boolean;
  /** Resume a previous run from its checkpoint. */
  resume?: BrainCheckpoint;
  signal?: AbortSignal;
  now?: () => Date;
  clock?: () => number;
  wallClockMs?: number;
  maxContextTokens?: number;
  /** Injected summariser for context compaction. */
  summarize?: (rendered: string) => string | Promise<string>;
  /**
   * Fired for each tool call **before** it runs, so a host can say what is about
   * to happen ("Filling 14 fields…") rather than only reporting afterwards.
   */
  onToolCall?: (call: ToolCall, stepIndex: number) => void;
  onStep?: (step: AgentStep) => void;
}

/** Run the agent loop. See {@link RunBrainOptions}. */
export async function runBrain(options: RunBrainOptions): Promise<RunBrainResult> {
  const now = options.now ?? (() => new Date());
  const clock = options.clock ?? (() => Date.now());
  const budget = resolveStepBudget(options.stepBudget, options.hardCap);
  const mode = normalizeMode(options.mode);
  const temperature = options.temperature ?? temperatureFor(mode);
  const tools = options.tools ?? [];
  const toolMap = new Map(tools.map((tool) => [tool.schema.name, tool]));
  const toolSchemas = tools.length > 0 ? tools.map((tool) => tool.schema) : undefined;
  const maxContextTokens = options.maxContextTokens ?? CONTEXT.maxTokens;
  const wallClockMs = options.wallClockMs ?? BRAIN.wallClockMs;

  const resumed = options.resume;
  let messages: ChatMessage[] = resumed
    ? resumed.messages.map((message) => ({ ...message }))
    : [
        {
          role: "system",
          content:
            options.systemPrompt ??
            buildSystemPrompt({ layers: options.layers, context: options.context, now: now() }),
        },
        ...(options.history ?? []),
        { role: "user", content: options.goal },
      ];

  let stepIndex = resumed?.stepIndex ?? 0;
  let plan: BrainPlan | null = resumed?.plan ?? null;
  const steps: AgentStep[] = [];
  const startedAt = clock();
  const deadline = startedAt + (Number.isFinite(wallClockMs) && wallClockMs > 0 ? wallClockMs : BRAIN.wallClockMs);

  const checkpoint = (): BrainCheckpoint => ({
    goal: options.goal,
    stepIndex,
    messages: messages.map((message) => ({ ...message })),
    plan,
    createdAt: now().toISOString(),
  });

  const finish = (status: BrainRunStatus, text: string, error?: string): RunBrainResult => {
    const cp = checkpoint();
    const base: RunBrainResult = {
      status,
      goal: options.goal,
      text,
      plan,
      steps,
      stepsExecuted: steps.length,
      stepBudget: budget.stepBudget,
      messages: messages.map((message) => ({ ...message })),
      checkpoint: cp,
    };
    if (error) base.error = error;
    return base;
  };

  const budgetStop = (reason: ContinueSignal["reason"], reasonText: string): RunBrainResult => {
    const cp = checkpoint();
    const signal: ContinueSignal = {
      continue: true,
      reason,
      stepIndex,
      stepsExecuted: steps.length,
      stepBudget: budget.stepBudget,
      message: `${reasonText} Nothing was lost — reply "${CONTINUE}" to resume from step ${stepIndex}.`,
      checkpoint: cp,
    };
    const result = finish("budget-exceeded", lastText(steps));
    result.continue = signal;
    return result;
  };

  // ── plan phase (best-effort; a failure never blocks the run) ──────────────
  if (!resumed && options.planner !== false) {
    try {
      const plannerResult = await options.model.chat({
        messages: [...messages, { role: "user", content: PLANNER_INSTRUCTION }],
        temperature: BRAIN.plannerTemperature,
        maxTokens: options.maxTokens,
      });
      plan = parsePlan(options.goal, plannerResult.text);
      const planned: ChatMessage = {
        role: "assistant",
        content: JSON.stringify({ plan: plan.steps }),
      };
      messages.push(planned);
    } catch {
      plan = null;
    }
  }

  // Consecutive tool failures with no success between them. Either counter
  // hitting its limit ends the run instead of burning the step budget.
  let sameFailureCount = 0;
  let lastFailureSignature: string | null = null;
  let consecutiveFailures = 0;

  // ── act / observe loop ────────────────────────────────────────────────────
  for (;;) {
    if (options.signal?.aborted) {
      return finish("cancelled", lastText(steps));
    }
    if (stepIndex >= budget.stepBudget) {
      return budgetStop("step-budget", `Reached the step budget of ${budget.stepBudget} steps.`);
    }
    if (clock() >= deadline) {
      return budgetStop("wall-clock", "Reached the run time limit.");
    }

    messages = limitToolResults(messages, CONTEXT.maxToolResultChars);
    if (totalTokens(messages) > maxContextTokens) {
      const compacted = await compactWithOverflowRecovery(messages, {
        maxTokens: maxContextTokens,
        summarize: options.summarize,
      });
      messages = compacted.messages;
    }

    const step = stepIndex;
    let result: ChatResult;
    try {
      result = await options.model.chat({
        messages,
        tools: toolSchemas,
        temperature,
        maxTokens: options.maxTokens,
        signal: options.signal,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? "model error");
      const failed: AgentStep = { index: step, text: "", toolCalls: [], finishReason: "error", observations: [] };
      steps.push(failed);
      safeOnStep(options.onStep, failed);
      return finish("error", "", message);
    }

    if (result.toolCalls.length > 0) {
      const assistant: ChatMessage = {
        role: "assistant",
        content: result.text,
        toolCalls: result.toolCalls,
      };
      messages.push(assistant);

      const observations: Observation[] = [];
      for (const call of result.toolCalls) {
        safeOnToolCall(options.onToolCall, call, step);
        const observation = await runTool(toolMap.get(call.name), call, step, options.signal);
        observations.push(observation);
        messages.push({
          role: "tool",
          toolCallId: call.id,
          name: call.name,
          content: observation.ok
            ? capToolResult(stringify(observation.result), CONTEXT.maxToolResultChars)
            : `Error: ${observation.error ?? "tool failed"}`,
        });
      }

      const agentStep: AgentStep = {
        index: step,
        text: result.text,
        toolCalls: result.toolCalls,
        finishReason: result.finishReason,
        observations,
      };
      steps.push(agentStep);
      safeOnStep(options.onStep, agentStep);

      // ── no-progress stops: a run that only fails is a stuck run ──────────
      const stepFailed = observations.length > 0 && observations.every((o) => !o.ok);
      if (stepFailed) {
        const signature = result.toolCalls
          .map((call) => `${call.name}:${stringify(call.arguments)}`)
          .join("|");
        sameFailureCount = signature === lastFailureSignature ? sameFailureCount + 1 : 1;
        lastFailureSignature = signature;
        consecutiveFailures += 1;
        if (sameFailureCount >= BRAIN.repeatFailureLimit) {
          return finish(
            "error",
            lastText(steps),
            `Stopped: the same failure repeated (${signature}) with no progress. ` +
              `The target may be missing or the page may have changed — inspect the page again before retrying.`,
          );
        }
        if (consecutiveFailures >= BRAIN.consecutiveFailureLimit) {
          return finish(
            "error",
            lastText(steps),
            `Stopped: the last ${consecutiveFailures} actions kept failing with no progress. ` +
              `Inspect the page again and try a different approach instead of repeating.`,
          );
        }
      } else {
        sameFailureCount = 0;
        lastFailureSignature = null;
        consecutiveFailures = 0;
      }

      stepIndex += 1;
      continue;
    }

    // No tool calls → the model gave its final answer.
    if (!result.text.trim() && isTruncated(result.finishReason)) {
      const failed: AgentStep = { index: step, text: "", toolCalls: [], finishReason: "error", observations: [] };
      steps.push(failed);
      safeOnStep(options.onStep, failed);
      return finish("error", "", "The model was cut off before answering — no usable reply arrived.");
    }
    if (result.text) messages.push({ role: "assistant", content: result.text });
    const finalStep: AgentStep = {
      index: step,
      text: result.text,
      toolCalls: [],
      finishReason: result.finishReason,
      observations: [],
    };
    steps.push(finalStep);
    safeOnStep(options.onStep, finalStep);
    stepIndex += 1;
    return finish("done", result.text);
  }
}

async function runTool(
  tool: AgentTool | undefined,
  call: ToolCall,
  stepIndex: number,
  signal: AbortSignal | undefined,
): Promise<Observation> {
  if (!tool) return { toolCall: call, ok: false, error: `Unknown tool "${call.name}"` };
  try {
    const result = await tool.run(call.arguments, { stepIndex, signal });
    // Honor a tool's own failure report: a thrown error is not the only way a
    // call fails. Without this, `{ok:false}` results read as successes and the
    // no-progress guards below can never fire.
    if (isRecord(result) && result["ok"] === false) {
      const failure: Observation = { toolCall: call, ok: false, result };
      const message = result["error"];
      if (typeof message === "string" && message !== "") failure.error = message;
      else failure.error = "tool failed";
      return failure;
    }
    return { toolCall: call, ok: true, result };
  } catch (error) {
    return { toolCall: call, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function safeOnStep(onStep: RunBrainOptions["onStep"], step: AgentStep): void {
  try {
    onStep?.(step);
  } catch {
    // An observer must never break the run.
  }
}

function safeOnToolCall(
  onToolCall: RunBrainOptions["onToolCall"],
  call: ToolCall,
  stepIndex: number,
): void {
  try {
    onToolCall?.(call, stepIndex);
  } catch {
    // An observer must never break the run.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Did the model stop because its output was truncated (no usable reply)? */
function isTruncated(finishReason: string | undefined): boolean {
  return (finishReason ?? "").trim().toLowerCase() === "length";
}

function lastText(steps: AgentStep[]): string {
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const text = steps[index]?.text;
    if (text) return text;
  }
  return "";
}

/** Extract a JSON object/array from a model reply that may include prose. */
function extractJson(raw: string): string | undefined {
  const start = raw.search(/[[{]/);
  if (start < 0) return undefined;
  const end = Math.max(raw.lastIndexOf("}"), raw.lastIndexOf("]"));
  if (end <= start) return undefined;
  return raw.slice(start, end + 1);
}

/** Parse a planner reply into a {@link BrainPlan} (never throws). */
export function parsePlan(goal: string, raw: string): BrainPlan {
  const text = typeof raw === "string" ? raw : "";
  const jsonText = extractJson(text);
  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText) as unknown;
      const list = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object" && Array.isArray((parsed as { steps?: unknown }).steps)
          ? (parsed as { steps: unknown[] }).steps
          : [];
      const steps = list
        .map((entry) => (typeof entry === "string" ? entry : stringify(entry)))
        .filter((entry) => entry.length > 0)
        .slice(0, 8);
      if (steps.length > 0) return { goal, steps, raw: text };
    } catch {
      // fall through to line parsing
    }
  }
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").trim())
    .filter((line) => line.length > 0)
    .slice(0, 8);
  return { goal, steps: lines, raw: text };
}

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value ?? null) ?? "null";
  } catch {
    return String(value);
  }
}
