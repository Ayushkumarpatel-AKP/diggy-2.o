/**
 * Tool-adapter tests: the Action Engine's catalogue rendered as the agent loop's
 * `AgentTool` shape (JSON Schema parameters + a model-facing result payload).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { resetTaint } from '@diggy/policy';
import type { RegisteredTool } from '../src/index.js';
import {
  AGENT_ACTION_TOOLS,
  createActionAPI,
  formatToolResult,
  paramsToJsonSchema,
  registryToAgentTools,
  toAgentTool,
  toToolSchema,
} from '../src/index.js';

function fakeTool(overrides: Partial<RegisteredTool> = {}): RegisteredTool {
  return {
    name: 'demo',
    description: 'A demo tool.',
    parameters: [],
    category: 'read',
    run: async () => ({ ok: true, extractedContent: 'done' }),
    ...overrides,
  };
}

describe('paramsToJsonSchema', () => {
  it('maps a parameter list to a JSON Schema object', () => {
    const schema = paramsToJsonSchema([
      { name: 'target', type: 'string', description: 'Where.', required: true },
      { name: 'amount', type: 'number', description: 'How much.', required: false },
    ]);

    expect(schema['type']).toBe('object');
    expect(schema['required']).toEqual(['target']);
    expect(schema['properties']).toEqual({
      target: { type: 'string', description: 'Where.' },
      amount: { type: 'number', description: 'How much.' },
    });
  });

  it('gives object/array parameters a usable sub-schema', () => {
    const schema = paramsToJsonSchema([
      { name: 'fields', type: 'object', description: 'A map.', required: true },
      { name: 'tags', type: 'array', description: 'A list.', required: false },
    ]);
    const properties = schema['properties'] as Record<string, Record<string, unknown>>;

    expect(properties['fields']).toEqual({
      type: 'object',
      description: 'A map.',
      additionalProperties: true,
    });
    expect(properties['tags']).toEqual({ type: 'array', description: 'A list.', items: {} });
  });

  it('omits `required` entirely when nothing is required', () => {
    const schema = paramsToJsonSchema([
      { name: 'q', type: 'string', description: 'Query.', required: false },
    ]);
    expect(schema).not.toHaveProperty('required');
    expect(schema['properties']).toHaveProperty('q');
  });
});

describe('toToolSchema', () => {
  it('carries the name and description straight through', () => {
    const schema = toToolSchema(
      fakeTool({
        name: 'click',
        description: 'Click a thing.',
        parameters: [{ name: 'target', type: 'string', description: 'Ref.', required: true }],
      }),
    );

    expect(schema.name).toBe('click');
    expect(schema.description).toBe('Click a thing.');
    expect(schema.parameters['required']).toEqual(['target']);
  });
});

describe('formatToolResult', () => {
  it('prefers extractedContent and drops duplicated/noisy data keys', () => {
    const shaped = formatToolResult('snapshot', {
      ok: true,
      extractedContent: '- button "Save"',
      data: { snapshot: { huge: true }, text: 'duplicate', decision: 'allow' },
    });

    expect(shaped).toEqual({ ok: true, content: '- button "Save"', data: { decision: 'allow' } });
  });

  it('falls back to data when there is no readable content', () => {
    const shaped = formatToolResult('click', { ok: true, data: { decision: 'ask' } });
    expect(shaped).toEqual({ ok: true, data: { decision: 'ask' } });
  });

  it('surfaces the error on failure', () => {
    const shaped = formatToolResult('click', { ok: false, error: 'No such element.' });
    expect(shaped).toEqual({ ok: false, error: 'No such element.' });
  });

  it('never returns an empty payload', () => {
    expect(formatToolResult('scroll', { ok: true })).toEqual({ ok: true, content: 'scroll succeeded.' });
    expect(formatToolResult('scroll', { ok: false })).toEqual({ ok: false, content: 'scroll failed.' });
  });
});

describe('toAgentTool', () => {
  beforeEach(() => {
    resetTaint();
    document.body.innerHTML = '';
  });

  it('delegates to the injected invoker and returns the shaped result', async () => {
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    const tool = toAgentTool(fakeTool({ name: 'scroll' }), async (name, args) => {
      calls.push({ name, args });
      return { ok: true, extractedContent: 'Scrolled down.' };
    });

    const out = await tool.run({ direction: 'down' }, { stepIndex: 0, signal: undefined });

    expect(calls).toEqual([{ name: 'scroll', args: { direction: 'down' } }]);
    expect(out).toEqual({ ok: true, content: 'Scrolled down.' });
  });

  it('reports a failed tool without throwing', async () => {
    const tool = toAgentTool(fakeTool(), async () => {
      throw new Error('bridge down');
    });

    await expect(tool.run({}, { stepIndex: 0, signal: undefined })).rejects.toThrow('bridge down');
  });
});

describe('registryToAgentTools', () => {
  beforeEach(() => {
    resetTaint();
    document.body.innerHTML = '';
  });

  it('exposes the curated act verbs and excludes the submit-shaped presses', () => {
    const engine = createActionAPI();
    const tools = registryToAgentTools(engine.tools.list(), async () => ({ ok: true }));

    expect(tools.map((tool) => tool.schema.name)).toEqual([...AGENT_ACTION_TOOLS]);
    expect(tools.map((tool) => tool.schema.name)).not.toContain('pressKey');
    expect(tools.map((tool) => tool.schema.name)).not.toContain('submit');
    expect(tools.map((tool) => tool.schema.name)).not.toContain('performUserSubmit');
  });

  it('runs a real read through the engine end to end', async () => {
    document.body.innerHTML = '<p>Bridge works.</p>';
    const engine = createActionAPI();
    const tools = registryToAgentTools(
      engine.tools.list(),
      (name, args) => engine.tools.invoke(name, args),
      ['read'],
    );

    expect(tools).toHaveLength(1);
    const out = (await tools[0]!.run({}, { stepIndex: 0, signal: undefined })) as {
      ok: boolean;
      content: string;
    };

    expect(out.ok).toBe(true);
    expect(out.content).toContain('Bridge works.');
    expect(out.content).toContain('BEGIN UNTRUSTED DATA');
  });
});
