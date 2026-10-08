/**
 * Policy → contract adapter.
 *
 * `@diggy/policy` speaks `allow | confirm | deny`; the shared Action Engine
 * contract (`@diggy/shared`'s `contracts/action.ts`) speaks
 * `PolicyDecision = "allow" | "ask" | "deny"` and pairs it with a
 * {@link PolicyVerdict}. This module is the one place that translation lives, so
 * the act layer never re-derives a decision.
 */
import { decide } from '@diggy/policy';
import type { DecideResult, Decision, PolicyContext } from '@diggy/policy';
import type { PolicyDecision, PolicyVerdict } from '@diggy/shared';

/** `confirm` is surfaced to the host as `ask` — a human must approve. */
export const DECISION_TO_POLICY: Readonly<Record<Decision, PolicyDecision>> = {
  allow: 'allow',
  confirm: 'ask',
  deny: 'deny',
};

/** Map an internal decision onto the shared contract's `PolicyDecision`. */
export function toPolicyDecision(decision: Decision): PolicyDecision {
  return DECISION_TO_POLICY[decision] ?? 'deny';
}

/** Adapt a `decide()` result into the shared `PolicyVerdict`. */
export function toVerdict(result: DecideResult): PolicyVerdict {
  const site = result.confirmPayload?.site;
  const verdict: PolicyVerdict = {
    decision: toPolicyDecision(result.decision),
    irreversible: result.category === 'irreversible',
    reason: result.reason,
  };
  if (typeof site === 'string' && site.trim() !== '') verdict.site = site;
  return verdict;
}

/**
 * Decide a tool call and return the shared-contract verdict in one step.
 *
 * `irreversible` is true for submit/send/delete/purchase/pay/transfer (and for a
 * `fillForm` with `submit: true`), and such a verdict is always at least `ask`.
 */
export function verdictFor(tool: unknown, args?: unknown, context?: PolicyContext): PolicyVerdict {
  return toVerdict(decide(tool, args, context));
}
