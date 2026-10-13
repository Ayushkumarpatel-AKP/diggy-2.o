/**
 * Reliability tests: the parts that make a synthetic action believable and
 * verifiable — actionability (scroll + re-resolve + visibility/enabled checks),
 * the full pointer/mouse gesture, and value read-back for `type`/`select`.
 *
 * These matter because the old behaviour was a bare `element.click()` with no
 * checks and no confirmation — the reason "the page loaded but nothing happened".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPageAgent } from '../src/index.js';
import type { PageAgent } from '../src/index.js';
import { refFor, setBody, stubRect } from './helpers.js';

const POINTER_TYPES = [
  'pointerover',
  'pointerenter',
  'mouseover',
  'mouseenter',
  'pointerdown',
  'mousedown',
  'pointerup',
  'mouseup',
  'click',
];

describe('click — believable gesture', () => {
  let agent: PageAgent;

  beforeEach(() => {
    document.body.innerHTML = '';
    agent = createPageAgent();
  });

  it('dispatches the full pointer/mouse sequence, not just a click', async () => {
    setBody(`<button type="button" id="menu">Open menu</button>`);
    const button = document.getElementById('menu') as HTMLButtonElement;
    const seen = new Set<string>();
    for (const type of POINTER_TYPES) button.addEventListener(type, () => seen.add(type));

    const ref = refFor(agent.snapshot(), 'Open menu');
    const result = await agent.click(ref);

    expect(result.ok).toBe(true);
    for (const type of POINTER_TYPES) expect(seen.has(type), `missing ${type}`).toBe(true);
  });

  it('scrolls the element into view first', async () => {
    setBody(`<button type="button" id="deep">Deep</button>`);
    const button = document.getElementById('deep') as HTMLButtonElement;
    const scrollSpy = vi.fn();
    (button as unknown as { scrollIntoView: typeof scrollSpy }).scrollIntoView = scrollSpy;

    const ref = refFor(agent.snapshot(), 'Deep');
    await agent.click(ref);

    expect(scrollSpy).toHaveBeenCalledTimes(1);
  });

  it('reports the element it touched, for the pointer overlay', async () => {
    setBody(`<button type="button" id="go">Go</button>`);
    const button = document.getElementById('go') as HTMLButtonElement;
    stubRect(button, { x: 12, y: 34, width: 40, height: 10 });

    const ref = refFor(agent.snapshot(), 'Go');
    const result = await agent.click(ref);

    expect(result.target).toEqual({
      ref,
      name: 'Go',
      role: 'button',
      bbox: { x: 12, y: 34, width: 40, height: 10 },
      inViewport: true,
    });
  });

  it('refuses an element that became hidden since the snapshot', async () => {
    setBody(`<button type="button" id="gone">Gone</button>`);
    const button = document.getElementById('gone') as HTMLButtonElement;
    const ref = refFor(agent.snapshot(), 'Gone');
    button.hidden = true;

    const result = await agent.click(ref);

    expect(result.ok).toBe(false);
    expect(result.error ?? '').toMatch(/hidden|not visible/i);
  });

  it('refuses an element that became disabled since the snapshot', async () => {
    setBody(`<button type="button" id="off">Off</button>`);
    const button = document.getElementById('off') as HTMLButtonElement;
    const ref = refFor(agent.snapshot(), 'Off');
    button.disabled = true;

    const result = await agent.click(ref);

    expect(result.ok).toBe(false);
    expect(result.error ?? '').toMatch(/disabled/i);
  });
});

describe('type / select — read-back verification', () => {
  let agent: PageAgent;

  beforeEach(() => {
    document.body.innerHTML = '';
    agent = createPageAgent();
  });

  it('verifies that the typed value landed', async () => {
    setBody(`<label for="nick">Nickname</label><input id="nick" type="text">`);
    const ref = refFor(agent.snapshot(), 'Nickname');

    const result = await agent.type(ref, 'diggy');

    expect(result.ok).toBe(true);
    expect(result.verified).toBe(true);
  });

  it('fails honestly when the field rejects the text', async () => {
    setBody(`<label for="ro">Read only</label><input id="ro" type="text">`);
    const input = document.getElementById('ro') as HTMLInputElement;
    const ref = refFor(agent.snapshot(), 'Read only');

    // The prototype setter writes the internal value, but this field reads back
    // empty — exactly what a framework-controlled input looks like.
    Object.defineProperty(input, 'value', { get: () => '', set: () => {}, configurable: true });

    const result = await agent.type(ref, 'nope');

    expect(result.ok).toBe(false);
    expect(result.error ?? '').toMatch(/still empty|could not type/i);
  });

  it('verifies that a select took the value', async () => {
    setBody(
      `<label for="freq">Frequency</label>` +
        `<select id="freq"><option value="d">Daily</option><option value="w">Weekly</option></select>`,
    );
    const ref = refFor(agent.snapshot(), 'Frequency');

    const result = await agent.select(ref, 'Weekly');

    expect(result.ok).toBe(true);
    expect(result.verified).toBe(true);
  });
});
