/**
 * Tool registry tests: browser-use-style catalogue, `ActionResult` shape and
 * total by-name invocation.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { resetTaint } from '@diggy/policy';
import { createActionAPI, ToolRegistry } from '../src/index.js';

function setBody(html: string): void {
  document.body.innerHTML = html;
}

describe('ToolRegistry (default Action Engine catalogue)', () => {
  beforeEach(() => {
    resetTaint();
    document.body.innerHTML = '';
  });

  it('exposes the action verbs with descriptions and policy categories', () => {
    const engine = createActionAPI();
    const names = engine.tools.names();

    for (const expected of [
      'snapshot',
      'read',
      'extract',
      'click',
      'type',
      'select',
      'pressKey',
      'fill',
      'scroll',
      'waitFor',
      'navigate',
      'goBack',
    ]) {
      expect(names, expected).toContain(expected);
    }

    const click = engine.tools.get('click');
    expect(click?.description.length).toBeGreaterThan(0);
    expect(click?.category).toBe('write');

    const describe = engine.tools.describe();
    expect(describe).toContain('Available tools:');
    expect(describe).toContain('- snapshot (read)');
    expect(describe).toContain('- navigate (read)');
  });

  it('invokes a read tool and returns extractedContent + data', async () => {
    setBody(`<p>Hello world from the page.</p>`);
    const engine = createActionAPI();
    const result = await engine.tools.invoke('read');

    expect(result.ok).toBe(true);
    expect(typeof result.extractedContent).toBe('string');
    expect(result.extractedContent ?? '').toContain('Hello world');
    expect(result.data).toBeDefined();
  });

  it('click returns an ActionResult and refuses a submit control', async () => {
    setBody(`<button type="button">Save draft</button><button type="submit">Place order</button>`);
    const engine = createActionAPI();

    const saved = await engine.tools.invoke('click', { target: 'Save draft' });
    expect(saved.ok).toBe(true);
    expect(saved.extractedContent ?? '').toContain('Clicked "Save draft"');

    const submitted = await engine.tools.invoke('click', { target: 'Place order' });
    expect(submitted.ok).toBe(false);
    expect(submitted.error ?? '').toMatch(/never submits/i);
  });

  it('is total: an unknown tool or a throwing tool yields ok:false, never an exception', async () => {
    const registry = new ToolRegistry();
    expect((await registry.invoke('nope')).ok).toBe(false);

    registry.register({
      name: 'boom',
      description: 'always throws',
      parameters: [],
      category: 'read',
      run: async () => {
        throw new Error('kaboom');
      },
    });

    const result = await registry.invoke('boom');
    expect(result.ok).toBe(false);
    expect(result.error ?? '').toContain('kaboom');
  });
});
