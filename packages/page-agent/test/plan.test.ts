/**
 * Plan-before-act tests.
 *
 * The three guarantees under test:
 *  - no generated plan contains a submit step;
 *  - an irreversible step is classified irreversible and requires approval;
 *  - a submit step is refused even when approved.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { resetTaint } from '@diggy/policy';
import type { Plan } from '@diggy/shared';
import {
  buildPlan,
  isIrreversibleStep,
  isSubmitStep,
  planIsSubmitFree,
  runPlan,
  SUBMIT_TOOL_NAMES,
  ToolRegistry,
} from '../src/index.js';

const GOALS = [
  'summarize this page',
  'read the article and extract the prices',
  'fill the contact form and submit it',
  'delete my account',
  'send an email to the vendor@example.com',
  'place the order and pay',
  'click "Save draft"',
];

describe('buildPlan', () => {
  beforeEach(() => {
    resetTaint();
  });

  it('never contains a submit or irreversible step, for any goal', () => {
    for (const goal of GOALS) {
      const plan = buildPlan(goal);
      expect(planIsSubmitFree(plan), goal).toBe(true);
      for (const step of plan.steps) {
        expect(SUBMIT_TOOL_NAMES.has(step.tool), `${goal}: ${step.tool}`).toBe(false);
        expect(isIrreversibleStep(step), `${goal}: ${step.tool}`).toBe(false);
        expect(isSubmitStep(step)).toBe(false);
      }
    }
  });

  it('starts with an accessibility-tree snapshot and annotates every step with a verdict', () => {
    const plan = buildPlan('read and summarize this page');
    expect(plan.steps[0]?.tool).toBe('snapshot');
    for (const step of plan.steps) {
      expect(step.verdict).toBeDefined();
    }
    expect(plan.goal).toBe('read and summarize this page');
    expect(typeof plan.createdAt).toBe('number');
  });

  it('adds a navigate step when the goal names a URL', () => {
    const plan = buildPlan('go to https://example.com and summarize it');
    const navigate = plan.steps.find((step) => step.tool === 'navigate');
    expect(navigate?.args['url']).toBe('https://example.com');
  });
});

describe('runPlan', () => {
  beforeEach(() => {
    resetTaint();
  });

  it('an irreversible step requires approval and does not run without it', async () => {
    const registry = new ToolRegistry();
    let ran = 0;
    registry.register({
      name: 'fillForm',
      description: 'a synthetic irreversible action',
      parameters: [],
      category: 'irreversible',
      run: async () => {
        ran += 1;
        return { ok: true, extractedContent: 'filled' };
      },
    });

    // `fillForm` with `submit: true` is irreversible but is not a bare submit verb.
    const plan: Plan = {
      goal: 'submit the form',
      createdAt: 0,
      steps: [{ id: 's1', description: 'Fill and submit', tool: 'fillForm', args: { submit: true } }],
    };
    expect(isIrreversibleStep(plan.steps[0]!)).toBe(true);
    expect(isSubmitStep(plan.steps[0]!)).toBe(false);

    const noApproval = await runPlan(plan, registry, {});
    expect(noApproval.status).toBe('awaiting-approval');
    expect(noApproval.pending?.id).toBe('s1');
    expect(ran).toBe(0);

    const approved = await runPlan(plan, registry, { approve: () => true });
    expect(approved.status).toBe('completed');
    expect(ran).toBe(1);
  });

  it('refuses an explicit submit step even when approved', async () => {
    const registry = new ToolRegistry();
    const plan: Plan = {
      goal: 'delete everything',
      createdAt: 0,
      steps: [{ id: 's1', description: 'Delete the account', tool: 'delete', args: {} }],
    };

    const result = await runPlan(plan, registry, { approve: () => true });
    expect(result.status).toBe('blocked');
    expect(result.results[0]?.ok).toBe(false);
    expect(result.results[0]?.error ?? '').toMatch(/never submits/i);
  });

  it('re-checks each step against policy (a sensitive-site navigate blocks)', async () => {
    const registry = new ToolRegistry();
    const plan: Plan = {
      goal: 'go to the bank',
      createdAt: 0,
      steps: [{ id: 's1', description: 'Navigate', tool: 'navigate', args: { url: 'https://www.chase.com/login' } }],
    };

    const result = await runPlan(plan, registry, {});
    expect(result.status).toBe('blocked');
    expect(result.verdicts[0]?.decision).toBe('deny');
  });

  it('runs a generated (all-reversible) plan to completion', async () => {
    document.body.innerHTML = `<h1>Report</h1><p>Quarterly numbers are up.</p>`;
    const registry = new ToolRegistry();
    registry.register({
      name: 'snapshot',
      description: 'snapshot',
      parameters: [],
      category: 'read',
      run: async () => ({ ok: true, extractedContent: 'tree' }),
    });
    registry.register({
      name: 'read',
      description: 'read',
      parameters: [],
      category: 'read',
      run: async () => ({ ok: true, extractedContent: 'text' }),
    });

    const plan = buildPlan('read and summarize this page');
    const result = await runPlan(plan, registry, {});
    expect(result.status).toBe('completed');
    expect(result.results.every((entry) => entry.ok)).toBe(true);
  });
});
