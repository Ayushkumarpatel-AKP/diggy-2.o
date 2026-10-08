/**
 * Action Engine contract — read/click/navigate/type/extract/fill + plan-before-act.
 * Safety is part of the contract, not an add-on: irreversible steps always require approval.
 * Owning worker: actions (`packages/page-agent`, `packages/policy`).
 */

export type PolicyDecision = "allow" | "ask" | "deny";

export interface PolicyVerdict {
  decision: PolicyDecision;
  /** irreversible = submit/pay/delete — always requires explicit human approval. */
  irreversible: boolean;
  reason: string;
  site?: string;
}

export interface ActionResult<T = unknown> {
  ok: boolean;
  /** Human-readable extracted content (browser-use ActionResult style). */
  extractedContent?: string;
  data?: T;
  error?: string;
}

export interface PlannedStep {
  id: string;
  description: string;
  tool: string;
  args: Record<string, unknown>;
  verdict?: PolicyVerdict;
}

export interface Plan {
  goal: string;
  steps: PlannedStep[];
  createdAt: number;
}

export interface ActionAPI {
  /** Accessibility-tree snapshot of the active page. */
  snapshot(): Promise<ActionResult>;
  read(target?: string): Promise<ActionResult<string>>;
  click(target: string): Promise<ActionResult>;
  type(target: string, text: string): Promise<ActionResult>;
  navigate(url: string): Promise<ActionResult>;
  extract(query: string): Promise<ActionResult>;
  /** Fill fields; never submits. */
  fill(fields: Record<string, string>): Promise<ActionResult>;
  /** Plan-before-act: produce a plan for user approval. */
  plan(goal: string): Promise<Plan>;
  /** Execute an approved plan; each step is re-checked against policy. */
  execute(plan: Plan): Promise<ActionResult[]>;
}
