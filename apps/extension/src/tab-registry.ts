/**
 * The tab registry — DIGGY's view of the browser.
 *
 * Until now DIGGY only ever knew the *active* tab (`tabs.query({active:true})`),
 * which is why it could not answer "how many tabs do you have open", could not
 * find the Google Form among four tabs, and could not tell two similar pages
 * apart. Every "context-aware" requirement rests on this file.
 *
 * It keeps a live list, refreshed from the browser and updated by the tab
 * lifecycle events, and it can score that list against a description the user
 * gave. The scoring is deliberately conservative: a close call reports
 * `ambiguous` so the caller can ask, rather than silently acting on the wrong tab.
 */
/** One open tab, as far as DIGGY is concerned. */
export interface TabInfo {
  id: number;
  url: string;
  title: string;
  active: boolean;
  windowId: number;
  lastAccessed?: number;
  favIconUrl?: string;
}

/** The answer to "which tab did they mean?". */
export interface TabResolution {
  /** Set only when one tab clearly wins. */
  best?: TabInfo;
  /** Candidates best-first, for asking the user to choose. */
  candidates: TabInfo[];
  /** True when the caller should ask rather than act. */
  ambiguous: boolean;
}

interface TabsApi {
  query(info: Record<string, unknown>): Promise<BrowserTab[]>;
  onCreated: { addListener(l: (tab: BrowserTab) => void): void };
  onUpdated: { addListener(l: (id: number, info: BrowserTab) => void): void };
  onRemoved: { addListener(l: (id: number) => void): void };
  onActivated: { addListener(l: (info: { tabId: number }) => void): void };
}

interface BrowserTab {
  id?: number;
  url?: string;
  title?: string;
  active?: boolean;
  windowId?: number;
  lastAccessed?: number;
  favIconUrl?: string;
}

function tabsApi(): TabsApi | undefined {
  const scope = globalThis as unknown as {
    browser?: { tabs?: TabsApi };
    chrome?: { tabs?: TabsApi };
  };
  return scope.browser?.tabs ?? scope.chrome?.tabs;
}

/** Pages a content script cannot reach, so they are not offered as targets. */
export function isScriptable(url: string | undefined): boolean {
  if (!url) return false;
  return /^https?:/i.test(url);
}

function toInfo(tab: BrowserTab): TabInfo | null {
  if (tab.id == null || !isScriptable(tab.url)) return null;
  return {
    id: tab.id,
    url: tab.url ?? "",
    title: tab.title ?? "",
    active: tab.active === true,
    windowId: tab.windowId ?? -1,
    ...(tab.lastAccessed !== undefined ? { lastAccessed: tab.lastAccessed } : {}),
    ...(tab.favIconUrl ? { favIconUrl: tab.favIconUrl } : {}),
  };
}

/** Words that carry no signal about which tab the user means. */
const STOP_WORDS = new Set([
  "the", "this", "that", "my", "in", "on", "at", "to", "of", "and", "or", "a", "an",
  "open", "tab", "page", "website", "site", "already", "please", "can", "you",
  "fill", "read", "click", "type", "form", "here", "it", "is", "are",
]);

export function tokens(describe: string): string[] {
  return describe
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
}

/** How well one tab matches the description, in arbitrary units. */
export function scoreTab(tab: TabInfo, words: readonly string[]): number {
  if (words.length === 0) return 0;
  const title = tab.title.toLowerCase();
  const url = tab.url.toLowerCase();
  let host = "";
  try {
    host = new URL(tab.url).host.replace(/^www\./, "").toLowerCase();
  } catch {
    /* a tab with an unparseable URL simply scores on title/url */
  }

  let score = 0;
  for (const word of words) {
    // A whole-word hit in the title is the strongest signal ("the google form").
    if (title.includes(word)) score += 3;
    if (host.includes(word)) score += 2;
    if (url.includes(word)) score += 1;
  }

  /*
   * The active-tab bonus applies ONLY when something already matched.
   *
   * Adding it unconditionally let the focused tab win with a score of zero when
   * nothing matched the description — which is exactly the "acted on whichever
   * tab was active" bug this module exists to remove. A tab the user is looking
   * at is a mild default, never a reason to pick it over no match at all.
   */
  if (score > 0 && tab.active) score += 1;
  return score;
}

/** A tie inside this margin is treated as "cannot tell", not as a winner. */
export const AMBIGUITY_MARGIN = 2;

export interface TabRegistry {
  /** Re-read the browser's tabs. */
  refresh(): Promise<TabInfo[]>;
  /** The last known list, newest state first (active tab first). */
  list(): TabInfo[];
  get(id: number): TabInfo | undefined;
  /** Which tab does this description mean? */
  resolve(describe: string): TabResolution;
  /** Start following the tab lifecycle events. */
  install(): void;
  /** Notified whenever the list changes. */
  subscribe(listener: (tabs: TabInfo[]) => void): () => void;
}

export function createTabRegistry(): TabRegistry {
  let cache: TabInfo[] = [];
  const listeners = new Set<(tabs: TabInfo[]) => void>();
  let installed = false;

  function publish(): void {
    for (const listener of listeners) {
      try {
        listener(cache);
      } catch {
        /* a listener must never break the registry */
      }
    }
  }

  async function refresh(): Promise<TabInfo[]> {
    const api = tabsApi();
    if (!api) return cache;
    try {
      const raw = await api.query({});
      cache = raw
        .map(toInfo)
        .filter((tab): tab is TabInfo => tab !== null)
        // Active first, then most recently used — the order a person thinks in.
        .sort((a, b) => {
          if (a.active !== b.active) return a.active ? -1 : 1;
          return (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0);
        });
      publish();
    } catch {
      /* keep the last good list rather than emptying the registry */
    }
    return cache;
  }

  function list(): TabInfo[] {
    return [...cache];
  }

  function get(id: number): TabInfo | undefined {
    return cache.find((tab) => tab.id === id);
  }

  function resolve(describe: string): TabResolution {
    const words = tokens(describe);
    const scored = cache
      .map((tab) => ({ tab, score: scoreTab(tab, words) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);

    // Nothing matched: hand back the open tabs so the caller can ask.
    if (scored.length === 0) {
      return { candidates: cache, ambiguous: cache.length > 0 };
    }

    const best = scored[0]!;
    const runnerUp = scored[1];
    const ambiguous = runnerUp !== undefined && best.score - runnerUp.score < AMBIGUITY_MARGIN;

    return {
      best: best.tab,
      candidates: scored.map((entry) => entry.tab),
      ambiguous,
    };
  }

  function install(): void {
    if (installed) return;
    const api = tabsApi();
    if (!api) return;
    installed = true;

    const onChanged = (): void => {
      void refresh();
    };
    api.onCreated.addListener(onChanged);
    api.onUpdated.addListener(onChanged);
    api.onRemoved.addListener(onChanged);
    api.onActivated.addListener(onChanged);
  }

  function subscribe(listener: (tabs: TabInfo[]) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { refresh, list, get, resolve, install, subscribe };
}
