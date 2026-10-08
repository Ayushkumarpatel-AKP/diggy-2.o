/**
 * Gate — **the confirm gate is real** (Node, always runs).
 *
 * The negative proof, independent of any browser: the plan layer refuses a
 * submit step while the very same runner happily executes an allowed read step.
 * That control makes the refusal meaningful — the gate blocks submits, it does
 * not block everything.
 *
 * Also checks the policy classifier treats submit-class actions as irreversible
 * (→ `confirm`) and a plain fill (no `submit:true`) as a reversible write (→ allow).
 */
import { buildPlan, runPlan, planIsSubmitFree, isSubmitStep, ToolRegistry } from '@diggy/page-agent';
import { decide } from '@diggy/policy';
import { buildPreview } from '@diggy/forms';
import { assert, assertEqual } from '../harness.mjs';

export const name = 'gate-confirm';
export const description = 'plan/policy refuse submit while allowing a read; a fill never submits';
export const kind = 'node';

function tool(name, category, onRun) {
  return { name, description: name, parameters: [], category, run: async () => onRun() };
}

export async function run() {
  // 1. A goal that ASKS to submit still yields a submit-free plan.
  const plan = buildPlan('Fill this job application form and submit it for me right now.');
  assert(plan.steps.length > 0, 'the plan must not be empty');
  assert(planIsSubmitFree(plan), 'no generated plan may contain a submit/irreversible step');
  assert(!plan.steps.some(isSubmitStep), 'buildPlan must never emit a submit-class step');
  assert(plan.steps.some((step) => step.tool === 'fill'), 'the fill intent must still produce a fill step');

  // 2. runPlan refuses an explicit submit step…
  let submitted = false;
  const registry = new ToolRegistry();
  registry.register(tool('submit', 'irreversible', () => { submitted = true; return { ok: true }; }));
  const blocked = await runPlan(
    { goal: 'submit', createdAt: 0, steps: [{ id: 's1', description: 'Submit the form', tool: 'submit', args: {} }] },
    registry,
  );
  assertEqual(blocked.status, 'blocked', 'runPlan must block a submit step');
  assertEqual(submitted, false, 'the submit handler must never run');
  assert(
    /never submits/i.test(blocked.results[0]?.error ?? ''),
    `the block reason must explain the never-submit rule (got "${blocked.results[0]?.error}")`,
  );

  // 3. …while executing an allowed read step (the control that makes 2 meaningful).
  let readRan = false;
  const readRegistry = new ToolRegistry();
  readRegistry.register(tool('read', 'read', () => { readRan = true; return { ok: true }; }));
  const completed = await runPlan(
    { goal: 'read', createdAt: 0, steps: [{ id: 'r1', description: 'Read the page', tool: 'read', args: {} }] },
    readRegistry,
  );
  assertEqual(completed.status, 'completed', 'an allowed read step must run');
  assertEqual(readRan, true, 'the read handler must have run');

  // 4. Policy: submit-class → irreversible/confirm; plain fill → allow.
  const sendEmail = decide('sendEmail', { to: 'a@b.com' });
  assertEqual(sendEmail.decision, 'confirm', 'sendEmail must require confirmation');
  assertEqual(sendEmail.category, 'irreversible', 'sendEmail must be irreversible');

  const submitForm = decide('submitForm', {});
  assertEqual(submitForm.decision, 'confirm', 'submitForm must require confirmation');

  const fillWithSubmit = decide('fillForm', { fields: [], submit: true });
  assertEqual(fillWithSubmit.decision, 'confirm', 'fillForm with submit:true must require confirmation');
  assertEqual(fillWithSubmit.category, 'irreversible', 'fillForm with submit:true is irreversible');

  const plainFill = decide('fillForm', { fields: [{ fieldId: 'fullName', value: 'x' }] });
  assertEqual(plainFill.decision, 'allow', 'a plain fill (no submit) must be allowed');

  // 5. The preview surface is submit-free by construction.
  const preview = buildPreview([
    { field: { id: 'f1', tag: 'input' }, classification: { kind: 'fullName', confidence: 1, basis: [] } },
  ]);
  assertEqual(preview.submit, false, 'FormPreview.submit must be false');

  return `plan submit-free, runPlan blocked a submit (handler never ran), a read ran, policy gated submit-class actions`;
}
