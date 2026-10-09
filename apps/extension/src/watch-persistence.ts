/**
 * Chrome-storage persistence for the monitor's watch store.
 *
 * Persists the monitor package's own `WatchRecord[]` shape over
 * `browser.storage.local` (key `diggy:watches-v2`) so the `WatchStore`
 * persistence contract is satisfied without the package touching `browser`.
 *
 * // INTERFACE FOR INTEGRATION
 * //   const WATCHES_STORAGE_KEY: "diggy:watches-v2"
 * //   function createChromeWatchPersistence(): WatchPersistence
 * // END INTERFACE FOR INTEGRATION
 *
 * Node-safety: `browser` is read lazily off `globalThis` inside each call, so
 * this module imports cleanly under a plain node test (loads return `[]` and
 * saves are best-effort no-ops there).
 */
import type { WatchPersistence, WatchRecord } from "@diggy/monitor";

/** Storage key holding the persisted `WatchRecord[]`. */
export const WATCHES_STORAGE_KEY = "diggy:watches-v2";

/** The slice of `browser.storage.local` this module uses. */
interface StorageLocalLike {
  get(key: string): Promise<unknown>;
  set(items: Record<string, unknown>): Promise<unknown>;
}

function storageLocal(): StorageLocalLike | undefined {
  const scope = globalThis as unknown as {
    browser?: { storage?: { local?: StorageLocalLike } };
    chrome?: { storage?: { local?: StorageLocalLike } };
  };
  return scope.browser?.storage?.local ?? scope.chrome?.storage?.local;
}

function isRecord(value: unknown): value is WatchRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as { spec?: unknown; state?: unknown };
  if (typeof record.spec !== "object" || record.spec === null) return false;
  if (typeof record.state !== "object" || record.state === null) return false;
  const spec = record.spec as { id?: unknown; url?: unknown };
  if (typeof spec.id !== "string" || spec.id.length === 0) return false;
  if (typeof spec.url !== "string" || spec.url.length === 0) return false;
  const state = record.state as { baseline?: unknown; armed?: unknown };
  return typeof state.baseline === "boolean" && typeof state.armed === "boolean";
}

/** Persistence over `browser.storage.local` (round-trips save → load). */
export function createChromeWatchPersistence(): WatchPersistence {
  return {
    async load(): Promise<WatchRecord[]> {
      const area = storageLocal();
      if (!area) return [];
      try {
        const raw = await area.get(WATCHES_STORAGE_KEY);
        const stored =
          typeof raw === "object" && raw !== null
            ? (raw as Record<string, unknown>)[WATCHES_STORAGE_KEY]
            : undefined;
        if (!Array.isArray(stored)) return [];
        return stored.filter(isRecord).map((record) => structuredClone(record));
      } catch {
        return [];
      }
    },

    async save(records: WatchRecord[]): Promise<void> {
      const area = storageLocal();
      if (!area) return;
      try {
        await area.set({ [WATCHES_STORAGE_KEY]: structuredClone(records) });
      } catch {
        /* durability is best-effort; the in-memory mirror stays authoritative */
      }
    },
  };
}
