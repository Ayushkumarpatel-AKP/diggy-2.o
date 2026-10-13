/**
 * Tab-targeting tests: the wiring that makes a page tool act on the tab the
 * model chose, instead of on whichever tab happens to be focused.
 *
 * Two layers are covered, because the bug this fixes lives between them:
 * - the page bridge must carry the chosen tab id on every request it sends, and
 * - `useTab` must resolve a description to the right tab (and refuse to guess
 *   when it is ambiguous) before any page tool runs.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ACTION_MESSAGE_TYPE,
  CATALOG_MESSAGE_TYPE,
  SUBMIT_MESSAGE_TYPE,
} from '@diggy/page-agent';
import { createToolkit, type Toolkit } from '../src/agent-tools.js';
import { createPageBridge, type SendToPage } from '../src/page-tools.js';
import { createTabRegistry, type TabInfo } from '../src/tab-registry.js';

interface SentMessage {
  type?: string;
  id?: string;
  tool?: string;
  args?: Record<string, unknown>;
  tabId?: number;
}

/** A minimal catalogue with the one curated verb these tests exercise. */
const CATALOGUE = [
  { name: 'read', description: 'Read the page.', parameters: [], category: 'read' as const },
];

/** A fake content-script boundary that records every message it is handed. */
function fakeSend(): { send: SendToPage; sent: SentMessage[] } {
  const sent: SentMessage[] = [];
  const send: SendToPage = async (message) => {
    const m = message as SentMessage;
    sent.push(m);
    if (m.type === CATALOG_MESSAGE_TYPE) return { id: m.id, ok: true, tools: CATALOGUE };
    if (m.type === SUBMIT_MESSAGE_TYPE) return { id: m.id, ok: true, label: 'Submit' };
    return { id: m.id, ok: true, result: { ok: true, extractedContent: 'read ok' } };
  };
  return { send, sent };
}

/** A three-tab fixture: the active tab is deliberately NOT the one we target. */
function threeTabs(): TabInfo[] {
  return [
    tab({ id: 1, title: 'YouTube', url: 'https://youtube.com', active: true }),
    tab({ id: 2, title: 'Google Forms — Survey', url: 'https://docs.google.com/forms/d/1' }),
    tab({ id: 3, title: 'Inbox — Gmail', url: 'https://mail.google.com' }),
  ];
}

function tab(over: Partial<TabInfo>): TabInfo {
  return { id: 1, url: 'https://example.com/', title: 'Example', active: false, windowId: 1, ...over };
}

/** Put a browser-shaped tabs API in place and prime a registry from it. */
async function registryOver(fixture: TabInfo[]) {
  (globalThis as unknown as { chrome?: unknown }).chrome = {
    tabs: {
      query: async () => fixture,
      onCreated: { addListener() {} },
      onUpdated: { addListener() {} },
      onRemoved: { addListener() {} },
      onActivated: { addListener() {} },
    },
  };
  const registry = createTabRegistry();
  await registry.refresh();
  return registry;
}

function tabsDep(registry: ReturnType<typeof createTabRegistry>) {
  return {
    list: () =>
      registry
        .list()
        .map((t) => ({ id: t.id, url: t.url, title: t.title, active: t.active })),
    get: (id: number) => {
      const t = registry.get(id);
      return t ? { id: t.id, url: t.url, title: t.title } : undefined;
    },
    resolve: (describe: string) => {
      const found = registry.resolve(describe);
      return {
        ...(found.best
          ? { best: { id: found.best.id, url: found.best.url, title: found.best.title } }
          : {}),
        candidates: found.candidates.map((t) => ({ id: t.id, url: t.url, title: t.title })),
        ambiguous: found.ambiguous,
      };
    },
  };
}

function toolNamed(toolkit: Toolkit, name: string) {
  const tool = toolkit.tools.find((candidate) => candidate.schema.name === name);
  if (!tool) throw new Error(`no tool named ${name}`);
  return tool;
}

async function run(tool: ReturnType<typeof toolNamed>, args: Record<string, unknown>) {
  return tool.run(args, { stepIndex: 0, signal: undefined });
}

afterEach(() => {
  delete (globalThis as unknown as { chrome?: unknown }).chrome;
});

describe('page bridge tab target', () => {
  it('follows the active tab until one is chosen', async () => {
    const { send, sent } = fakeSend();
    const bridge = createPageBridge(send);

    await bridge.invoke('read', {});

    expect(sent[0]?.tabId).toBeUndefined();
    expect(bridge.targetTabId()).toBeUndefined();
  });

  it('stamps the chosen tab id on every request it sends', async () => {
    const { send, sent } = fakeSend();
    const bridge = createPageBridge(send);

    bridge.target(2);
    await bridge.invoke('read', {});
    await bridge.submit();

    expect(sent.map((m) => m.tabId)).toEqual([2, 2]);
    expect(sent[0]?.type).toBe(ACTION_MESSAGE_TYPE);
    expect(sent[1]?.type).toBe(SUBMIT_MESSAGE_TYPE);
  });

  it('returns to the active tab when the target is cleared', async () => {
    const { send, sent } = fakeSend();
    const bridge = createPageBridge(send);

    bridge.target(2);
    await bridge.invoke('read', {});
    bridge.target(undefined);
    await bridge.invoke('read', {});

    expect(sent.map((m) => m.tabId)).toEqual([2, undefined]);
  });
});

describe('useTab', () => {
  let registry: ReturnType<typeof createTabRegistry>;

  beforeEach(async () => {
    registry = await registryOver(threeTabs());
  });

  async function toolkit(): Promise<Toolkit> {
    const { send } = fakeSend();
    return createToolkit({ send, tabs: tabsDep(registry) });
  }

  it('resolves a description to the tab the user meant, not the active one', async () => {
    const kit = await toolkit();

    const aimed = (await run(toolNamed(kit, 'useTab'), {
      describe: 'the google form that is open',
    })) as { content: string };

    // The active tab is YouTube (id 1); the form is id 2.
    expect(aimed.content).toContain('tab 2');
    expect(kit.page.targetTabId()).toBe(2);
  });

  it('then sends the page tools to that tab', async () => {
    const { send, sent } = fakeSend();
    const kit = await createToolkit({ send, tabs: tabsDep(registry) });

    await run(toolNamed(kit, 'useTab'), { describe: 'gmail' });
    await run(toolNamed(kit, 'read'), {});

    const action = sent.find((m) => m.type === ACTION_MESSAGE_TYPE && m.tool === 'read');
    expect(action?.tabId).toBe(3);
  });

  it('accepts an explicit tab id from listTabs', async () => {
    const kit = await toolkit();

    const aimed = (await run(toolNamed(kit, 'useTab'), { tabId: 3 })) as { content: string };

    expect(aimed.content).toContain('Gmail');
    expect(kit.page.targetTabId()).toBe(3);
  });

  it('refuses to guess between two alike tabs', async () => {
    const alike = await registryOver([
      tab({ id: 1, title: 'YouTube', url: 'https://youtube.com', active: true }),
      tab({ id: 2, title: 'Google Forms — Survey', url: 'https://docs.google.com/forms/d/1' }),
      tab({ id: 3, title: 'Google Forms — Survey', url: 'https://docs.google.com/forms/d/2' }),
    ]);
    const { send, sent } = fakeSend();
    const kit = await createToolkit({ send, tabs: tabsDep(alike) });

    const aimed = (await run(toolNamed(kit, 'useTab'), { describe: 'google form' })) as {
      content: string;
    };

    expect(aimed.content).toContain('More than one tab matches');
    expect(kit.page.targetTabId()).toBeUndefined();

    // And a following read therefore still follows the active tab (no tabId).
    await run(toolNamed(kit, 'read'), {});
    const action = sent.find((m) => m.type === ACTION_MESSAGE_TYPE && m.tool === 'read');
    expect(action?.tabId).toBeUndefined();
  });

  it('does not target anything when nothing matches', async () => {
    const kit = await toolkit();

    await run(toolNamed(kit, 'useTab'), { describe: 'a page that is not open' });

    expect(kit.page.targetTabId()).toBeUndefined();
  });

  it('rejects an unknown tab id instead of sending tools nowhere', async () => {
    const kit = await toolkit();

    const aimed = (await run(toolNamed(kit, 'useTab'), { tabId: 99 })) as { ok: boolean };

    expect(aimed.ok).toBe(false);
    expect(kit.page.targetTabId()).toBeUndefined();
  });
});
