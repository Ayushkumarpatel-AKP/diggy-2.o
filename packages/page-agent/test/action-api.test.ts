/**
 * Action Engine end-to-end: the shared `ActionAPI` surface, plus recording and
 * the message host.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetTaint } from '@diggy/policy';
import type { Plan } from '@diggy/shared';
import { ACTION_MESSAGE_TYPE, createActionAPI, createActionHost, createActionListener } from '../src/index.js';
import type { ActionEngine, ActionResponse } from '../src/index.js';

function setBody(html: string): void {
  document.body.innerHTML = html;
}

describe('createActionAPI (the ActionAPI contract)', () => {
  let engine: ActionEngine;

  beforeEach(() => {
    resetTaint();
    document.body.innerHTML = '';
    engine = createActionAPI();
  });

  it('exposes the full contract surface', () => {
    for (const method of [
      'snapshot',
      'read',
      'click',
      'type',
      'navigate',
      'extract',
      'fill',
      'plan',
      'execute',
    ] as const) {
      expect(typeof engine[method]).toBe('function');
    }
    expect(engine.tools.size()).toBeGreaterThan(0);
  });

  it('snapshot returns the accessibility tree as extractedContent', async () => {
    setBody(`<main><h1>Home</h1><button type="button">Open</button></main>`);
    const result = await engine.snapshot();

    expect(result.ok).toBe(true);
    expect(result.extractedContent ?? '').toContain('heading "Home"');
    const data = result.data as { snapshot: { nodes: unknown[] }; flags: unknown[] };
    expect(Array.isArray(data.snapshot.nodes)).toBe(true);
  });

  it('click runs a plain control but refuses a submit control', async () => {
    setBody(
      `<button type="button" id="ok">Save draft</button>` +
        `<form><button type="submit" id="send">Send message</button></form>`,
    );
    const clicked = vi.fn();
    document.getElementById('ok')?.addEventListener('click', clicked);

    const saved = await engine.click('Save draft');
    expect(saved.ok).toBe(true);
    expect(clicked).toHaveBeenCalledTimes(1);

    const sent = await engine.click('Send message');
    expect(sent.ok).toBe(false);
    expect(sent.error ?? '').toMatch(/never submits/i);
  });

  it('type sets the field value and never echoes the text', async () => {
    setBody(`<label for="email">Email</label><input id="email" type="text">`);
    const result = await engine.type('Email', 'secret@example.com');

    expect(result.ok).toBe(true);
    expect(result.extractedContent ?? '').not.toContain('secret@example.com');
    expect((document.getElementById('email') as HTMLInputElement).value).toBe('secret@example.com');
  });

  it('fill fills fields and never submits', async () => {
    setBody(
      `<form onsubmit="return false">` +
        `<label for="name">Name</label><input id="name" type="text">` +
        `<label for="email">Email</label><input id="email" type="text">` +
        `<button type="submit">Submit</button></form>`,
    );
    const result = await engine.fill({ Name: 'Ayush', Email: 'a@b.com' });

    expect(result.ok).toBe(true);
    expect((document.getElementById('name') as HTMLInputElement).value).toBe('Ayush');
    expect((document.getElementById('email') as HTMLInputElement).value).toBe('a@b.com');
  });

  it('extract returns query-relevant lines', async () => {
    setBody(
      `<main><p>Quarterly revenue is $1.2M.</p><p>Unrelated footer text.</p>` +
        `<button type="button">Download report</button></main>`,
    );
    const result = await engine.extract('revenue report');
    expect(result.ok).toBe(true);
    expect(result.extractedContent ?? '').toMatch(/revenue|report/i);
  });

  it('plan returns a submit-free plan and execute runs the reversible steps', async () => {
    setBody(`<h1>Report</h1><p>Quarterly numbers are up.</p>`);
    const plan = await engine.plan('read and summarize this page');
    expect(plan.steps[0]?.tool).toBe('snapshot');

    const results = await engine.execute(plan);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((result) => result.ok)).toBe(true);
  });

  it('execute requires approval for an irreversible step', async () => {
    const plan: Plan = {
      goal: 'submit the form',
      createdAt: 0,
      steps: [{ id: 's1', description: 'Fill and submit', tool: 'fillForm', args: { submit: true } }],
    };

    const withoutApproval = await engine.execute(plan);
    expect(withoutApproval).toHaveLength(0);

    const withApproval = await engine.execute(plan, { approve: () => true });
    expect(withApproval).toHaveLength(1);
  });

  it('records a successful run into a value-free playbook', async () => {
    setBody(`<label for="email">Email</label><input id="email" type="text"><button type="button">Continue</button>`);

    engine.startRecording();
    await engine.type('Email', 'a@b.com');
    await engine.click('Continue');
    expect(engine.isRecording()).toBe(true);
    engine.stopRecording();

    const playbook = engine.playbook('Signup', 'sign up');
    expect(playbook).not.toBeNull();
    expect(playbook?.steps.map((step) => step.tool)).toEqual(['type', 'click']);
    expect(JSON.stringify(playbook)).not.toContain('a@b.com');
  });
});

describe('createActionHost', () => {
  beforeEach(() => {
    resetTaint();
    document.body.innerHTML = '';
  });

  it('dispatches a snapshot request and rejects a malformed one', async () => {
    setBody(`<h1>Home</h1>`);
    const host = createActionHost(createActionAPI());

    const ok = await host.handle({ type: ACTION_MESSAGE_TYPE, id: '1', method: 'snapshot' });
    expect(ok.ok).toBe(true);
    expect(ok.id).toBe('1');

    const bad = await host.handle({ type: 'nope', id: '2', method: 'snapshot' });
    expect(bad.ok).toBe(false);
  });

  it('does not auto-approve execute unless the caller asks', async () => {
    setBody(`<h1>Home</h1>`);
    const host = createActionHost(createActionAPI());
    const plan: Plan = {
      goal: 'x',
      createdAt: 0,
      steps: [{ id: 's1', description: 'd', tool: 'fillForm', args: { submit: true } }],
    };

    const noApproval = await host.handle({
      type: ACTION_MESSAGE_TYPE,
      id: '1',
      method: 'execute',
      params: plan,
    });
    expect(noApproval.result).toEqual([]);
  });

  it('createActionListener claims its messages and replies', async () => {
    setBody(`<h1>Home</h1>`);
    const host = createActionHost(createActionAPI());
    const responses: ActionResponse[] = [];
    const listener = createActionListener(host, (response) => responses.push(response));

    expect(listener({ type: 'other', id: 'x', method: 'snapshot' })).toBe(false);
    expect(listener({ type: ACTION_MESSAGE_TYPE, id: '7', method: 'snapshot' })).toBe(true);
    await vi.waitFor(() => expect(responses).toHaveLength(1));
    expect(responses[0]?.ok).toBe(true);
  });
});
