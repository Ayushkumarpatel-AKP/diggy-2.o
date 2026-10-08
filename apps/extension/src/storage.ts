/**
 * Extension-side storage surface.
 * Owning worker: core. Wraps `chrome.storage.local` behind the `@diggy/shared` typed helper
 * and exposes an IndexedDB handle for the larger blob stores feature workers will add.
 *
 * // INTERFACE FOR INTEGRATION
 * interface ExtensionStorageSchema {
 *   onboarded: boolean;
 *   theme: "light" | "dark";
 *   activeWatchCount: number;
 *   lastActivityAt: number;
 * }
 * const storage: TypedStorage<ExtensionStorageSchema>;   // over chrome.storage.local
 * const localArea: StorageAreaLike;                       // raw adapter
 * openDiggyDatabase(opts?: { name?: string; version?: number }): Promise<IDBDatabase>
 * // END INTERFACE FOR INTEGRATION
 */
import { createStorage, type StorageAreaLike } from "@diggy/shared";
import { browser } from "wxt/browser";

export interface ExtensionStorageSchema {
  onboarded: boolean;
  theme: "light" | "dark";
  activeWatchCount: number;
  lastActivityAt: number;
}

/** Adapter mapping `chrome.storage.local` onto the environment-agnostic area contract. */
export const localArea: StorageAreaLike = {
  async get(keys) {
    return (await browser.storage.local.get(keys ?? null)) as Record<string, unknown>;
  },
  async set(items) {
    await browser.storage.local.set(items);
  },
  async remove(keys) {
    await browser.storage.local.remove(keys);
  },
  async clear() {
    await browser.storage.local.clear();
  },
};

export const storage = createStorage<ExtensionStorageSchema>(localArea);

export const DIGGY_DB_NAME = "diggy";
export const DIGGY_DB_VERSION = 1;

/**
 * IndexedDB placeholder — object stores for activity, monitor baselines and vault blobs are
 * registered by their owning workers in later phases.
 */
export function openDiggyDatabase(
  options: { name?: string; version?: number } = {},
): Promise<IDBDatabase> {
  const name = options.name ?? DIGGY_DB_NAME;
  const version = options.version ?? DIGGY_DB_VERSION;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = () => {
      // Intentionally empty: schemas are added by feature workers.
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
}
