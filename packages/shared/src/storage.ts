/**
 * Typed key/value storage helper for `@diggy/shared`.
 * Environment-agnostic: wire any `StorageAreaLike` (e.g. `chrome.storage.local`) into it.
 * Owning worker: core.
 *
 * // INTERFACE FOR INTEGRATION
 * interface StorageAreaLike {
 *   get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
 *   set(items: Record<string, unknown>): Promise<void>;
 *   remove(keys: string | string[]): Promise<void>;
 *   clear?(): Promise<void>;
 * }
 * interface TypedStorage<T extends object> {
 *   get<K extends keyof T & string>(key: K): Promise<T[K] | undefined>;
 *   getAll(): Promise<Partial<T>>;
 *   set<K extends keyof T & string>(key: K, value: T[K]): Promise<void>;
 *   remove<K extends keyof T & string>(key: K): Promise<void>;
 *   clear(): Promise<void>;
 * }
 * createStorage<T extends object>(area: StorageAreaLike): TypedStorage<T>
 * createMemoryStorageArea(initial?: Record<string, unknown>): StorageAreaLike
 * // END INTERFACE FOR INTEGRATION
 */

export interface StorageAreaLike {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
  clear?(): Promise<void>;
}

export interface TypedStorage<T extends object> {
  get<K extends keyof T & string>(key: K): Promise<T[K] | undefined>;
  getAll(): Promise<Partial<T>>;
  set<K extends keyof T & string>(key: K, value: T[K]): Promise<void>;
  remove<K extends keyof T & string>(key: K): Promise<void>;
  clear(): Promise<void>;
}

export function createStorage<T extends object>(area: StorageAreaLike): TypedStorage<T> {
  return {
    async get<K extends keyof T & string>(key: K): Promise<T[K] | undefined> {
      const bag = await area.get(key);
      return bag[key] as T[K] | undefined;
    },
    async getAll(): Promise<Partial<T>> {
      return (await area.get(null)) as unknown as Partial<T>;
    },
    async set<K extends keyof T & string>(key: K, value: T[K]): Promise<void> {
      await area.set({ [key]: value });
    },
    async remove<K extends keyof T & string>(key: K): Promise<void> {
      await area.remove(key);
    },
    async clear(): Promise<void> {
      if (area.clear) {
        await area.clear();
        return;
      }
      const bag = await area.get(null);
      const keys = Object.keys(bag);
      if (keys.length > 0) await area.remove(keys);
    },
  };
}

/** In-memory `StorageAreaLike` for tests and non-browser contexts. */
export function createMemoryStorageArea(
  initial: Record<string, unknown> = {},
): StorageAreaLike {
  let data: Record<string, unknown> = { ...initial };
  return {
    async get(keys) {
      if (keys === null || keys === undefined) return { ...data };
      const list = Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const key of list) {
        if (key in data) out[key] = data[key];
      }
      return out;
    },
    async set(items) {
      data = { ...data, ...items };
    },
    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const key of list) delete data[key];
    },
    async clear() {
      data = {};
    },
  };
}
