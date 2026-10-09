/**
 * Cost accounting and a search cache — the two halves of "use tokens well".
 *
 * **Accounting** answers "what is this costing me". Every model call records its
 * usage, so the panel can show spend and the user can see which provider is
 * actually being hit — which matters precisely because there is a fallback key.
 *
 * **Caching** is the cheapest token saving there is: the same search twice in a
 * few minutes is common when a user asks a follow-up, and a cached result costs
 * nothing at all. Short TTLs only — a stale answer to "who won today" is worse
 * than a paid one.
 */
import { DEFAULT_COST_TABLE } from "@diggy/core";

export const USAGE_STORAGE_KEY = "diggy:usage";

/** One model call, as far as accounting is concerned. */
export interface UsageSample {
  provider: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  /** Set when the provider reports a real charge; otherwise we estimate. */
  costUsd?: number;
}

/**
 * Price a call from the **same table the failover registry uses**, so the readout
 * the user sees can never disagree with the registry's own metrics.
 */
export function estimateCostUsd(sample: UsageSample): number {
  const entry = DEFAULT_COST_TABLE[sample.model];
  if (!entry) return 0;
  const prompt = (sample.promptTokens ?? 0) / 1_000_000;
  const completion = (sample.completionTokens ?? 0) / 1_000_000;
  return prompt * entry.inputPer1M + completion * entry.outputPer1M;
}

/** One recorded model call. */
export interface UsageRecord extends UsageSample {
  at: number;
}

export interface UsageTotals {
  requests: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
}

export interface UsageLedger {
  record(sample: UsageSample): void;
  total(): Promise<UsageTotals>;
  recent(count?: number): Promise<UsageRecord[]>;
  clear(): Promise<void>;
  /** A one-line summary suitable for the status bubble. */
  summary(): Promise<string>;
}

interface StorageLocalLike {
  get(key: string): Promise<unknown>;
  set(items: Record<string, unknown>): Promise<unknown>;
  remove(key: string): Promise<void>;
}

function storage(): StorageLocalLike | undefined {
  const scope = globalThis as unknown as {
    browser?: { storage?: { local?: StorageLocalLike } };
    chrome?: { storage?: { local?: StorageLocalLike } };
  };
  return scope.browser?.storage?.local ?? scope.chrome?.storage?.local;
}

/** Keep the ledger small: the last 200 calls is plenty for a UI readout. */
const MAX_RECORDS = 200;

function isRecord(value: unknown): value is UsageRecord {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row["at"] === "number" && typeof row["costUsd"] === "number";
}

export function createUsageLedger(key = USAGE_STORAGE_KEY): UsageLedger {
  let cache: UsageRecord[] | null = null;
  let writing: Promise<void> = Promise.resolve();

  async function read(): Promise<UsageRecord[]> {
    if (cache) return cache;
    const area = storage();
    if (!area) return (cache = []);
    try {
      const raw = (await area.get(key)) as Record<string, unknown>;
      const stored = raw[key];
      cache = Array.isArray(stored) ? stored.filter(isRecord) : [];
    } catch {
      cache = [];
    }
    return cache;
  }

  async function flush(): Promise<void> {
    const area = storage();
    if (!area) return;
    const next = await read();
    writing = writing
      .then(() => area.set({ [key]: next.slice(-MAX_RECORDS) }))
      .then(() => undefined)
      .catch(() => undefined);
    await writing;
  }

  function record(sample: UsageSample): void {
    const costUsd = sample.costUsd ?? estimateCostUsd(sample);
    const entry: UsageRecord = { ...sample, costUsd, at: Date.now() };
    void read().then((records) => {
      records.push(entry);
      if (records.length > MAX_RECORDS) records.splice(0, records.length - MAX_RECORDS);
      void flush();
    });
  }

  async function total(): Promise<UsageTotals> {
    const records = await read();
    return records.reduce<UsageTotals>(
      (sum, entry) => ({
        requests: sum.requests + 1,
        promptTokens: sum.promptTokens + (entry.promptTokens ?? 0),
        completionTokens: sum.completionTokens + (entry.completionTokens ?? 0),
        costUsd: sum.costUsd + (entry.costUsd ?? 0),
      }),
      { requests: 0, promptTokens: 0, completionTokens: 0, costUsd: 0 },
    );
  }

  async function recent(count = 20): Promise<UsageRecord[]> {
    const records = await read();
    return records.slice(-count).reverse();
  }

  async function clear(): Promise<void> {
    cache = [];
    const area = storage();
    if (!area) return;
    try {
      await area.remove(key);
    } catch {
      /* nothing to clear */
    }
  }

  async function summary(): Promise<string> {
    const totals = await total();
    if (totals.requests === 0) return "No model calls yet this session.";
    const cost = totals.costUsd < 0.01 ? "<$0.01" : `$${totals.costUsd.toFixed(2)}`;
    return `${totals.requests} calls · ${totals.promptTokens + totals.completionTokens} tokens · ~${cost}`;
  }

  return { record, total, recent, clear, summary };
}

/* --- search cache --------------------------------------------------------- */

interface CacheEntry<T> {
  value: T;
  at: number;
}

export interface TtlCache<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  clear(): void;
  size(): number;
}

/**
 * A tiny TTL cache. Kept in memory: a service-worker restart losing it costs one
 * repeat search, and persisting it would mean paying storage writes for
 * something whose whole value is being short-lived.
 */
export function createTtlCache<T>(ttlMs: number, maxEntries = 40): TtlCache<T> {
  const entries = new Map<string, CacheEntry<T>>();

  function evict(now = Date.now()): void {
    for (const [key, entry] of entries) {
      if (now - entry.at > ttlMs) entries.delete(key);
    }
    while (entries.size > maxEntries) {
      const oldest = entries.keys().next();
      if (oldest.done) break;
      entries.delete(oldest.value);
    }
  }

  return {
    get(key: string): T | undefined {
      evict();
      const entry = entries.get(key);
      return entry ? entry.value : undefined;
    },
    set(key: string, value: T): void {
      entries.set(key, { value, at: Date.now() });
      evict();
    },
    clear(): void {
      entries.clear();
    },
    size(): number {
      return entries.size;
    },
  };
}

/** The cache key for a search: normalised so casing/space differ the same query. */
export function searchCacheKey(query: string, max?: number): string {
  return `${query.trim().toLowerCase().replace(/\s+/g, " ")}::${max ?? 5}`;
}

/** Wrap a search so an identical query inside the TTL is free. */
export function cachedSearch<T>(
  cache: TtlCache<T>,
  search: (query: string, max?: number) => Promise<T>,
): (query: string, max?: number) => Promise<T> {
  return async (query: string, max?: number) => {
    const key = searchCacheKey(query, max);
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const value = await search(query, max);
    cache.set(key, value);
    return value;
  };
}
