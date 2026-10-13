/**
 * Inspect → act → verify tests: after a page action, the tool result must carry
 * the page's state afterwards ("Page now:"), so the model sees the consequence
 * instead of trusting that the action worked.
 */
import { describe, expect, it } from 'vitest';
import { ACTION_MESSAGE_TYPE, CATALOG_MESSAGE_TYPE } from '@diggy/page-agent';
import { createToolkit, type Toolkit } from '../src/agent-tools.js';
import type { SendToPage } from '../src/page-tools.js';

const CATALOGUE = [
  { name: 'click', description: 'Click a thing.', parameters: [], category: 'write' as const },
  { name: 'read', description: 'Read the page.', parameters: [], category: 'read' as const },
];

interface Sent {
  type?: string;
  tool?: string;
  tabId?: number;
}

/** A page that reports a fresh accessibility tree on every snapshot. */
function fakePage() {
  const sent: Sent[] = [];
  let snapshots = 0;
  const send: SendToPage = async (message) => {
    const m = message as Sent & { id?: string };
    sent.push({ type: m.type, tool: m.tool, tabId: m.tabId });
    if (m.type === CATALOG_MESSAGE_TYPE) return { id: m.id, ok: true, tools: CATALOGUE };
    if (m.tool === 'snapshot') {
      snapshots += 1;
      return {
        id: m.id,
        ok: true,
        result: { ok: true, extractedContent: `- button "Send" [ref=${snapshots}]` },
      };
    }
    return {
      id: m.id,
      ok: true,
      result: {
        ok: true,
        extractedContent: 'Clicked "Send".',
        data: { verified: true, target: { ref: 1, name: 'Send', role: 'button' } },
      },
    };
  };
  return { send, sent, snapshotCount: () => snapshots };
}

function toolNamed(kit: Toolkit, name: string) {
  const tool = kit.tools.find((candidate) => candidate.schema.name === name);
  if (!tool) throw new Error(`no tool named ${name}`);
  return tool;
}

describe('verify after act', () => {
  it('appends the page state after an action tool runs', async () => {
    const { send, sent, snapshotCount } = fakePage();
    const kit = await createToolkit({ send });

    const result = (await toolNamed(kit, 'click').run({}, { stepIndex: 0, signal: undefined })) as {
      ok: boolean;
      content: string;
    };

    expect(result.ok).toBe(true);
    expect(result.content).toContain('Clicked "Send".');
    expect(result.content).toContain('Page now:');
    expect(result.content).toContain('button "Send"');
    // One snapshot was taken, and it was an action message.
    expect(snapshotCount()).toBe(1);
    expect(sent.some((m) => m.type === ACTION_MESSAGE_TYPE && m.tool === 'snapshot')).toBe(true);
  });

  it('does not re-inspect after a read', async () => {
    const { send, snapshotCount } = fakePage();
    const kit = await createToolkit({ send });

    await toolNamed(kit, 'read').run({}, { stepIndex: 0, signal: undefined });

    expect(snapshotCount()).toBe(0);
  });
});
