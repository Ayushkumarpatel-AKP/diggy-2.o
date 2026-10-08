/**
 * Saved-playbook tests: recording a successful run yields a reusable,
 * **value-free** workflow.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { clearVaultValues, registerVaultValue } from '@diggy/policy';
import { PlaybookRecorder, replayPlaybook, toValueFreePlaybook, valueFreeArgs } from '../src/index.js';

describe('valueFreeArgs', () => {
  it('replaces typed text and field values with placeholders', () => {
    const args = valueFreeArgs({ target: 'Email', text: 'a@b.com', ref: 7 });
    expect(args['target']).toBe('Email');
    expect(args['text']).toBe('{{text}}');
    expect(args['ref']).toBeUndefined();
    expect(JSON.stringify(args)).not.toContain('a@b.com');
  });

  it('replaces each filled field value with its own placeholder', () => {
    const args = valueFreeArgs({ fields: { email: 'a@b.com', name: 'Ayush' } });
    expect(args['fields']).toEqual({ email: '{{email}}', name: '{{name}}' });
    expect(JSON.stringify(args)).not.toContain('a@b.com');
    expect(JSON.stringify(args)).not.toContain('Ayush');
  });

  it('replaces a URL and a query with placeholders', () => {
    const args = valueFreeArgs({ url: 'https://example.com/private', query: 'my bank balance' });
    expect(args['url']).toBe('{{url}}');
    expect(args['query']).toBe('{{query}}');
  });

  it('never throws on garbage', () => {
    expect(valueFreeArgs(undefined)).toEqual({});
    expect(valueFreeArgs('nope' as never)).toEqual({});
    expect(valueFreeArgs({ nested: { deep: [1, 2, 3] } })).toEqual({ nested: { deep: [1, 2, 3] } });
  });
});

describe('PlaybookRecorder', () => {
  afterEach(() => {
    clearVaultValues();
  });

  it('records only successful actions and freezes a value-free playbook', () => {
    const recorder = new PlaybookRecorder();
    recorder.record('type', { target: 'Email', text: 'a@b.com' }, { ok: true });
    recorder.record('click', { target: 'Continue' }, { ok: false }); // failed → dropped

    expect(recorder.size()).toBe(1);
    const playbook = recorder.toPlaybook('Newsletter signup', 'sign up for the newsletter');
    expect(playbook.name).toBe('Newsletter signup');
    expect(playbook.steps).toHaveLength(1);
    expect(playbook.steps[0]?.tool).toBe('type');
    expect(JSON.stringify(playbook)).not.toContain('a@b.com');
    expect(JSON.stringify(playbook)).toContain('{{text}}');
  });

  it('stops and restarts recording', () => {
    const recorder = new PlaybookRecorder();
    recorder.record('click', { target: 'A' }, { ok: true });
    recorder.stop();
    recorder.record('click', { target: 'B' }, { ok: true });
    expect(recorder.size()).toBe(1);
    expect(recorder.isRecording()).toBe(false);

    recorder.start();
    recorder.record('click', { target: 'C' }, { ok: true });
    expect(recorder.size()).toBe(2);
  });

  it('never lets a registered vault value into a playbook', () => {
    registerVaultValue('SUPER-SECRET-PAN');
    const recorder = new PlaybookRecorder();
    recorder.record('type', { target: 'PAN', text: 'SUPER-SECRET-PAN' }, { ok: true });

    const playbook = recorder.toPlaybook('KYC');
    expect(JSON.stringify(playbook)).not.toContain('SUPER-SECRET-PAN');
    expect(JSON.stringify(playbook)).toContain('{{text}}');
  });

  it('toValueFreePlaybook re-scrubs and replayPlaybook replays each step', async () => {
    const recorder = new PlaybookRecorder();
    recorder.record('navigate', { url: 'https://example.com/secret-page' }, { ok: true });
    recorder.record('click', { target: 'Download' }, { ok: true });

    const scrubbed = toValueFreePlaybook(recorder.toPlaybook('Download flow'));
    expect(JSON.stringify(scrubbed)).not.toContain('secret-page');

    const tools: string[] = [];
    const results = await replayPlaybook(scrubbed, async (step) => {
      tools.push(step.tool);
      return { ok: true, extractedContent: step.tool };
    });
    expect(tools).toEqual(['navigate', 'click']);
    expect(results).toHaveLength(2);
    expect(results.every((result) => result.ok)).toBe(true);
  });
});
