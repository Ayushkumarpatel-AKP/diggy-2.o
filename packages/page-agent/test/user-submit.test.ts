/**
 * User-submit tests: finding the page's submitter, pressing it on the user's
 * behalf, and proving the agent loop has no route to it.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { resetTaint } from '@diggy/policy';
import {
  ACTION_MESSAGE_TYPE,
  AGENT_ACTION_TOOLS,
  createActionAPI,
  createToolHost,
  createToolListener,
  findSubmitControl,
  performUserSubmit,
  registryToAgentTools,
  SUBMIT_MESSAGE_TYPE,
  type ToolResponse,
} from '../src/index.js';

/** Count real submits on the form and stop jsdom's "not implemented" noise. */
function countSubmits(): () => number {
  let count = 0;
  document.addEventListener('submit', (event) => {
    count += 1;
    event.preventDefault();
  });
  return () => count;
}

describe('findSubmitControl', () => {
  beforeEach(() => {
    resetTaint();
    document.body.innerHTML = '';
  });

  it('finds a button[type=submit]', () => {
    document.body.innerHTML = `<form><input name="a"><button type="submit">Apply now</button></form>`;
    const control = findSubmitControl();
    expect(control?.label).toBe('Apply now');
    expect(control?.element.tagName).toBe('BUTTON');
  });

  it('finds an input[type=submit]', () => {
    document.body.innerHTML = `<form><input type="submit" value="Place order"></form>`;
    expect(findSubmitControl()?.label).toBe('Place order');
  });

  it('treats a bare <button> inside a form as the submitter', () => {
    document.body.innerHTML = `<form><input name="a"><button>Send message</button></form>`;
    expect(findSubmitControl()?.label).toBe('Send message');
  });

  it('ignores a plain type=button control', () => {
    document.body.innerHTML = `<button type="button">Save draft</button>`;
    expect(findSubmitControl()).toBeNull();
  });

  it('skips disabled and hidden controls', () => {
    document.body.innerHTML = `
      <form>
        <button type="submit" disabled>Apply now</button>
        <button type="submit" aria-hidden="true">Sneaky</button>
      </form>`;
    expect(findSubmitControl()).toBeNull();
  });

  it('returns null on a page with nothing to submit', () => {
    document.body.innerHTML = `<p>Just a paragraph.</p>`;
    expect(findSubmitControl()).toBeNull();
  });
});

describe('performUserSubmit', () => {
  beforeEach(() => {
    resetTaint();
    document.body.innerHTML = '';
  });

  it('presses the control and the form submits exactly once', () => {
    document.body.innerHTML = `<form><input name="a"><button type="submit">Apply now</button></form>`;
    const submits = countSubmits();

    const control = findSubmitControl();
    expect(control).not.toBeNull();

    const result = performUserSubmit(control!);
    expect(result.ok).toBe(true);
    expect(result.label).toBe('Apply now');
    expect(submits()).toBe(1);
  });

  it('refuses a disabled control', () => {
    document.body.innerHTML = `<form><button type="submit" disabled>Apply now</button></form>`;
    const element = document.querySelector('button') as HTMLElement;
    const result = performUserSubmit(element);

    expect(result.ok).toBe(false);
    expect(result.error ?? '').toMatch(/disabled/i);
  });

  it('refuses a detached control', () => {
    const element = document.createElement('button');
    element.textContent = 'Apply now';
    const result = performUserSubmit(element);

    expect(result.ok).toBe(false);
    expect(result.error ?? '').toMatch(/no longer on the page/i);
  });
});

describe('the agent loop has no direct route to submit', () => {
  beforeEach(() => {
    resetTaint();
    document.body.innerHTML = '';
  });

  it('registers submit, but only as an irreversible, approval-gated verb', () => {
    const engine = createActionAPI();
    const names = engine.tools.names();
    expect(names).toContain('submit');
    expect(engine.tools.get('submit')?.category).toBe('irreversible');
    expect(names).not.toContain('performUserSubmit');
    expect(names).not.toContain('findSubmitControl');
  });

  it('keeps submit out of the model catalogue', () => {
    const engine = createActionAPI();
    const tools = registryToAgentTools(
      engine.tools.list(),
      async () => ({ ok: true }),
      AGENT_ACTION_TOOLS,
    );
    expect(tools.map((tool) => tool.schema.name)).not.toContain('submit');
  });

  it('does not press without approval, and presses once approved', async () => {
    document.body.innerHTML = `<form><input name="a"><button type="submit">Apply now</button></form>`;
    const submits = countSubmits();
    const engine = createActionAPI();

    const refused = await engine.tools.invoke('submit', {});
    expect(refused.ok).toBe(false);
    expect(submits()).toBe(0);

    const approved = await engine.tools.invoke('submit', {}, { approved: true });
    expect(approved.ok).toBe(true);
    expect(submits()).toBe(1);
  });

  it('answers a submit request only on the dedicated user-gesture message', async () => {
    document.body.innerHTML = `<form><input name="a"><button type="submit">Apply now</button></form>`;
    const submits = countSubmits();
    const host = createToolHost();

    // A tool request cannot name it.
    const viaTool = await host.handle({
      type: ACTION_MESSAGE_TYPE,
      id: '1',
      tool: 'submit',
      args: {},
    });
    expect(viaTool.ok).toBe(false);
    expect(submits()).toBe(0);

    // Only the explicit submit message presses it.
    const viaGesture = (await host.handle({ type: SUBMIT_MESSAGE_TYPE, id: '2' })) as ToolResponse;
    expect(viaGesture.ok).toBe(true);
    expect(viaGesture.label).toBe('Apply now');
    expect(submits()).toBe(1);
  });

  it('reports honestly when the page has no submitter', async () => {
    document.body.innerHTML = `<p>Nothing here.</p>`;
    const host = createToolHost();
    const response = await host.handle({ type: SUBMIT_MESSAGE_TYPE, id: '3' });

    expect(response.ok).toBe(false);
    expect(response.error ?? '').toMatch(/no submit button/i);
  });
});

describe('createToolListener', () => {
  beforeEach(() => {
    resetTaint();
    document.body.innerHTML = '';
  });

  it('claims only its own messages', () => {
    const host = createToolHost();
    const listener = createToolListener(host, () => undefined);

    expect(listener({ type: 'diggy:command', intent: 'ask' })).toBe(false);
    expect(listener({ type: ACTION_MESSAGE_TYPE, id: '1', tool: 'read' })).toBe(true);
    expect(listener({ type: SUBMIT_MESSAGE_TYPE, id: '2' })).toBe(true);
  });

  it('runs a tool and sends the response back', async () => {
    document.body.innerHTML = `<p>Listener works.</p>`;
    const host = createToolHost();
    const sent: unknown[] = [];
    const listener = createToolListener(host, (response) => sent.push(response));

    expect(listener({ type: ACTION_MESSAGE_TYPE, id: 'x', tool: 'read', args: {} })).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sent).toHaveLength(1);
    expect((sent[0] as { ok: boolean }).ok).toBe(true);
  });
});
