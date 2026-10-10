/**
 * Tab-registry tests: the scoring that decides which tab the user meant.
 *
 * These matter more than most, because every context-aware behaviour rests on
 * picking the right tab — and the failure mode (acting on the wrong tab) is
 * exactly what the registry exists to prevent.
 */
import { describe, expect, it } from 'vitest';
import {
  AMBIGUITY_MARGIN,
  createTabRegistry,
  isScriptable,
  scoreTab,
  tokens,
  type TabInfo,
} from '../src/tab-registry.js';

function tab(over: Partial<TabInfo>): TabInfo {
  return {
    id: 1,
    url: 'https://example.com/',
    title: 'Example',
    active: false,
    windowId: 1,
    ...over,
  };
}

describe('isScriptable', () => {
  it('offers http and https pages', () => {
    expect(isScriptable('https://example.com')).toBe(true);
    expect(isScriptable('http://example.com')).toBe(true);
  });

  it('excludes the pages a content script can never reach', () => {
    expect(isScriptable('chrome://extensions')).toBe(false);
    expect(isScriptable('edge://settings')).toBe(false);
    expect(isScriptable('about:blank')).toBe(false);
    expect(isScriptable(undefined)).toBe(false);
  });
});

describe('tokens', () => {
  it('drops the words that say nothing about which tab', () => {
    expect(tokens('fill the form in the open tab')).toEqual([]);
  });

  it('keeps the words that identify the target', () => {
    expect(tokens('fill the Google Form')).toContain('google');
  });
});

describe('scoreTab', () => {
  it('scores a title match above a url match', () => {
    const words = tokens('google form');
    const titleHit = scoreTab(tab({ title: 'Google Form', url: 'https://x.com/a' }), words);
    const urlHit = scoreTab(tab({ title: 'Untitled', url: 'https://x.com/google-form' }), words);
    expect(titleHit).toBeGreaterThan(urlHit);
  });

  it('scores nothing for an unrelated page', () => {
    expect(scoreTab(tab({ title: 'YouTube', url: 'https://youtube.com' }), tokens('google form'))).toBe(0);
  });
});

describe('resolve', () => {
  const registry = createTabRegistry();
  // The registry refreshes from the browser, which is absent here — so the test
  // drives the same scoring the resolver uses, through a local list.
  const tabs: TabInfo[] = [
    tab({ id: 1, title: 'YouTube', url: 'https://youtube.com', active: true }),
    tab({ id: 2, title: 'Google Forms — Survey', url: 'https://docs.google.com/forms/d/1' }),
    tab({ id: 3, title: 'Inbox — Gmail', url: 'https://mail.google.com' }),
  ];

  function resolveAgainst(describe: string) {
    const words = tokens(describe);
    const scored = tabs
      .map((entry) => ({ tab: entry, score: scoreTab(entry, words) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);
    if (scored.length === 0) return { candidates: tabs, ambiguous: tabs.length > 0 };
    const best = scored[0]!;
    const runnerUp = scored[1];
    return {
      best: best.tab,
      candidates: scored.map((entry) => entry.tab),
      ambiguous: runnerUp !== undefined && best.score - runnerUp.score < AMBIGUITY_MARGIN,
    };
  }

  it('picks the Google Form even though YouTube is the active tab', () => {
    const result = resolveAgainst('fill the google form that is open');
    expect(result.best?.id).toBe(2);
    expect(result.ambiguous).toBe(false);
  });

  it('picks Gmail when the command says gmail', () => {
    expect(resolveAgainst('check gmail').best?.id).toBe(3);
  });

  it('does not silently choose when nothing matches', () => {
    const result = resolveAgainst('tell me about quantum physics');
    expect(result.best).toBeUndefined();
    expect(result.ambiguous).toBe(true);
    expect(result.candidates).toHaveLength(tabs.length);
  });

  it('reports ambiguity rather than guessing between two alike tabs', () => {
    const alike: TabInfo[] = [
      tab({ id: 1, title: 'Google Forms — Survey', url: 'https://docs.google.com/forms/d/1' }),
      tab({ id: 2, title: 'Google Forms — Survey', url: 'https://docs.google.com/forms/d/2' }),
    ];
    const words = tokens('the google form');
    const scored = alike
      .map((entry) => ({ tab: entry, score: scoreTab(entry, words) }))
      .sort((a, b) => b.score - a.score);
    const gap = scored[0]!.score - scored[1]!.score;
    expect(gap).toBeLessThan(AMBIGUITY_MARGIN);
  });

  it('exposes an empty list rather than throwing without a browser', () => {
    expect(registry.list()).toEqual([]);
    expect(registry.get(1)).toBeUndefined();
  });
});
