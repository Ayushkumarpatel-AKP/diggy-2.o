/**
 * Plan-before-act.
 *
 * `buildPlan(goal)` turns a natural-language goal into a {@link Plan} the user
 * approves **before** anything runs. Two guarantees are structural, not
 * incidental:
 *
 * 1. **No generated plan contains a submit step.** The planner never emits a
 *    `send`/`submit`/`delete`/`purchase`/`pay`/… action (see
 *    {@link SUBMIT_TOOL_NAMES} / {@link isSubmitStep}); the final Submit/Confirm
 *    is always the human's click. A goal that *asks* to submit simply yields a
 *    plan that stops at the last reversible step.
 * 2. **Every step is re-checked against policy.** Each step carries a
 *    {@link PolicyVerdict} and `runPlan` re-evaluates it immediately before
 *    running: `deny` blocks, an irreversible or otherwise `ask` step needs an
 *    explicit approval, and a submit-class step is refused even when approved.
 */
import type { Plan, PlannedStep, PolicyVerdict, ActionResult } from '@diggy/shared';
import type { PolicyContext } from '@diggy/policy';
import { policyToolFor, toolCategory } from './tool-registry.js';
import type { ToolRegistry } from './tool-registry.js';
import type { ToolHandlerContext } from './tool-registry.js';
import { verdictFor } from './verdict.js';

/**
 * The policy verbs that may never appear in a generated plan (and that
 * `runPlan` refuses to execute even with approval). This is the machine-readable
 * form of "the agent never submits".
 */
export const SUBMIT_TOOL_NAMES: ReadonlySet<string> = new Set([
  'send',
  'sendEmail',
  'sendMessage',
  'submit',
  'submitForm',
  'delete',
  'purchase',
  'pay',
  'transfer',
  'post',
  'comment',
]);

/** True when a step is an explicit submit/send/delete/purchase action. */
export function isSubmitStep(step: PlannedStep): boolean {
  return SUBMIT_TOOL_NAMES.has(step.tool);
}

/** True when a step's policy class is `irreversible` (submit verbs, or a fill with `submit: true`). */
export function isIrreversibleStep(step: PlannedStep): boolean {
  return toolCategory(step.tool, step.args) === 'irreversible';
}

/** True when every step of a plan is submit-free and reversible. */
export function planIsSubmitFree(plan: Plan): boolean {
  return plan.steps.every((step) => !isSubmitStep(step) && !isIrreversibleStep(step));
}

/** Options for {@link buildPlan}. */
export interface BuildPlanOptions {
  /** Policy context (origin, taint, allow list) for the per-step verdicts. */
  context?: PolicyContext;
  /** Injected clock (tests). */
  now?: () => number;
  /** Stable id factory (tests); defaults to `step-<n>`. */
  idFactory?: (index: number) => string;
}

const URL_PATTERN = /https?:\/\/[^\s"'<>]+/i;
const READ_INTENT = /\b(read|summari[sz]e|explain|understand|what(?:'s| is| does)|tell me)\b/i;
const FILL_INTENT = /\b(fill|type|enter|complete|write)\b/i;
const CLICK_INTENT = /\b(click|press|open|select|choose|go to)\b/i;
const EXTRACT_INTENT = /\b(extract|find|list|collect|scrape|gather|price|prices)\b/i;
const QUOTED = /["“'‘]([^"”'’]{1,80})["”'’]/;

/**
 * Build a plan for `goal`.
 *
 * Deterministic and rule-based: a leading accessibility-tree snapshot, an
 * optional navigation, then the intents the goal names (read / extract / fill /
 * click). It never emits a submit step (see the module docs).
 */
export function buildPlan(goal: string, options: BuildPlanOptions = {}): Plan {
  const idFactory = options.idFactory ?? ((index: number) => `step-${index}`);
  const now = options.now ?? (() => Date.now());
  const text = typeof goal === 'string' ? goal : '';
  const steps: PlannedStep[] = [];
  let index = 0;

  const push = (tool: string, description: string, args: Record<string, unknown>): void => {
    // Defense in depth: never let a submit or otherwise irreversible step into a
    // generated plan.
    const candidate: PlannedStep = { id: idFactory(index), description, tool, args };
    if (isSubmitStep(candidate) || isIrreversibleStep(candidate)) return;
    steps.push(candidate);
    index += 1;
  };

  push('snapshot', 'Read the page as an accessibility tree to see its controls.', {});

  const url = URL_PATTERN.exec(text)?.[0];
  if (url) push('navigate', `Navigate to ${url}.`, { url });

  if (READ_INTENT.test(text)) {
    push('read', 'Read the visible page text.', {});
  }
  if (EXTRACT_INTENT.test(text)) {
    push('extract', `Extract the information the goal asks for.`, { query: text });
  }
  if (CLICK_INTENT.test(text)) {
    const target = QUOTED.exec(text)?.[1]?.trim();
    push('click', target ? `Click "${target}".` : 'Click the control the goal names.', target ? { target } : {});
  }
  if (FILL_INTENT.test(text)) {
    push('fill', 'Fill the requested fields (values are supplied at run time).', { fields: {} });
  }

  // A plan that is only a snapshot is still useful (it is how the user sees the
  // page); keep it. Annotate every step with its policy verdict.
  const context = options.context ?? {};
  const annotated = steps.map((step) => ({
    ...step,
    verdict: verdictFor(policyToolFor(step.tool), step.args, context),
  }));

  return { goal: text, steps: annotated, createdAt: now() };
}

/** Options for {@link runPlan}. */
export interface PlanExecutionOptions {
  /** Policy context for the re-check. */
  context?: PolicyContext;
  /** Approve an `ask`/irreversible step. Called once per gated step. */
  approve?: (step: PlannedStep, verdict: PolicyVerdict) => boolean | Promise<boolean>;
  /** Pre-approved step ids (an alternative to the callback). */
  approvedStepIds?: readonly string[];
  /** Stop at the first failed step (default true). */
  stopOnError?: boolean;
}

/** The outcome of {@link runPlan}. */
export interface PlanExecutionResult {
  status: 'completed' | 'awaiting-approval' | 'blocked' | 'failed';
  results: ActionResult[];
  /** The step awaiting approval, when `status === 'awaiting-approval'`. */
  pending?: PlannedStep;
  /** The verdict of every step that was reached, in order. */
  verdicts: PolicyVerdict[];
}

/**
 * Execute a plan, re-checking each step against policy and requiring approval
 * for anything irreversible or `ask`.
 *
 * A submit-class step is **never** executed, even when approved — the user
 * presses it. The run stops there (`blocked`).
 */
export async function runPlan(
  plan: Plan,
  registry: ToolRegistry,
  options: PlanExecutionOptions = {},
): Promise<PlanExecutionResult> {
  const results: ActionResult[] = [];
  const verdicts: PolicyVerdict[] = [];
  const context = options.context ?? {};
  const stopOnError = options.stopOnError !== false;

  for (const step of plan.steps) {
    const policyName = policyToolFor(step.tool);
    const verdict = verdictFor(policyName, step.args, context);
    verdicts.push(verdict);

    if (verdict.decision === 'deny') {
      results.push({ ok: false, error: verdict.reason });
      return { status: 'blocked', results, verdicts };
    }

    if (isSubmitStep(step)) {
      results.push({
        ok: false,
        error: 'Diggy never submits, sends, deletes or purchases. The final Submit is the user\u2019s to press.',
      });
      return { status: 'blocked', results, verdicts };
    }

    if (verdict.irreversible || verdict.decision === 'ask') {
      const approved = await isApproved(step, verdict, options);
      if (!approved) {
        return { status: 'awaiting-approval', results, verdicts, pending: step };
      }
    }

    const handlerContext: ToolHandlerContext = { policy: context, approved: true };
    const result = await registry.invoke(step.tool, step.args, handlerContext);
    results.push(result);
    if (!result.ok && stopOnError) {
      return { status: 'failed', results, verdicts };
    }
  }

  return { status: 'completed', results, verdicts };
}

async function isApproved(
  step: PlannedStep,
  verdict: PolicyVerdict,
  options: PlanExecutionOptions,
): Promise<boolean> {
  if (options.approvedStepIds?.includes(step.id)) return true;
  if (options.approve) return (await options.approve(step, verdict)) === true;
  return false;
}
