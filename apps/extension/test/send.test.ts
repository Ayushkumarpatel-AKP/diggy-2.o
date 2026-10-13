/**
 * Authorized-send tests: the `send` tool must never press a Send/Submit button
 * without the user's approval, and when approved it must target the tab the run
 * is working in.
 */
import { describe, expect, it, vi } from 'vitest';
import { CATALOG_MESSAGE_TYPE, SUBMIT_MESSAGE_TYPE } from '@diggy/page-agent';
import { createToolkit, type Toolkit } from '../src/agent-tools.js';
import type { SendToPage } from '../src/page-tools.js';

const CATALOGUE = [
  { name: 'read', description: 'Read the page.', parameters: [], category: 'read' as const },
];

const TAB = {
  id: 7,
  url: 'https://www.instagram.com/direct/t/1',
  title: 'Instagram',
  active: true,
};

function fakePage() {
  const sent: { type?: string; tool?: string; tabId?: number }[] = [];
  const send: SendToPage = async (message) => {
    const m = message as { type?: string; tool?: string; tabId?: number; id?: string };
    sent.push({ type: m.type, tool: m.tool, tabId: m.tabId });
    if (m.type === CATALOG_MESSAGE_TYPE) return { id: m.id, ok: true, tools: CATALOGUE };
    if (m.type === SUBMIT_MESSAGE_TYPE) return { id: m.id, ok: true, label: 'Send' };
    return { id: m.id, ok: true, result: { ok: true, extractedContent: 'ok' } };
  };
  return { send, sent };
}

const tabs = {
  list: () => [TAB],
  get: (id: number) => (id === TAB.id ? { id, url: TAB.url, title: TAB.title } : undefined),
  resolve: () => ({ candidates: [], ambiguous: false }),
};

function sendTool(kit: Toolkit) {
  const tool = kit.tools.find((candidate) => candidate.schema.name === 'send');
  if (!tool) throw new Error('no send tool');
  return tool;
}

describe('send — authorized only', () => {
  it('is not offered when sending is not available', async () => {
    const { send } = fakePage();
    const kit = await createToolkit({ send, tabs });
    expect(kit.tools.some((tool) => tool.schema.name === 'send')).toBe(false);
  });

  it('does not press when the user denies', async () => {
    const { send, sent } = fakePage();
    const allowSend = vi.fn(async () => false);
    const kit = await createToolkit({ send, tabs, allowSend });

    const result = (await sendTool(kit).run(
      { reason: 'Send "Hello Priyanka." to Priyanka' },
      { stepIndex: 0, signal: undefined },
    )) as { ok: boolean };

    expect(result.ok).toBe(false);
    expect(allowSend).toHaveBeenCalledTimes(1);
    expect(sent.some((m) => m.type === SUBMIT_MESSAGE_TYPE)).toBe(false);
  });

  it('presses after approval, in the chosen tab', async () => {
    const { send, sent } = fakePage();
    const allowSend = vi.fn(async () => true);
    const kit = await createToolkit({ send, tabs, allowSend });
    kit.page.target(TAB.id);

    const result = (await sendTool(kit).run(
      { reason: 'Send "Hello Priyanka." to Priyanka' },
      { stepIndex: 0, signal: undefined },
    )) as { ok: boolean; content: string };

    expect(result.ok).toBe(true);
    expect(result.content).toContain('sent');
    const submit = sent.find((m) => m.type === SUBMIT_MESSAGE_TYPE);
    expect(submit?.tabId).toBe(TAB.id);
  });
});
