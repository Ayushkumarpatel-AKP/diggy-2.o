/**
 * `@diggy/activity` — append-only `ActivityEvent` log.
 *
 * Every event is redacted (see `./redact.js`) before it is written, held in a
 * memory sink for synchronous reads, mirrored to an IndexedDB sink for
 * durability, and fanned out to `onRecord` subscribers. History is
 * append-only: events are never mutated or deleted through this API.
 *
 * // INTERFACE FOR INTEGRATION
 * interface ActivityLogOptions {
 *   now?: () => number;                       // default Date.now
 *   idFactory?: () => string;                 // default "ev_<epoch>_<counter>"
 *   secrets?: SecretsInput;                   // locked values to redact (see redact.js)
 *   dbName?: string;                          // default "diggy-activity"
 *   persistent?: boolean;                     // default true; false = memory only
 * }
 * function createActivityLog(options?: ActivityLogOptions): ActivityLog
 * type ActivityLog = ActivityAPI & {
 *   readonly ready: Promise<void>;            // resolves once IndexedDB backfill lands
 *   flush(): Promise<void>;                   // drains pending IndexedDB writes
 *   close(): Promise<void>;                   // flush + release the IndexedDB handle
 * }
 * class MemoryActivitySink { events: ActivityEvent[]; write(e): void; }
 * class IndexedDbActivitySink { write(e): Promise<void>; readAll(): Promise<ActivityEvent[]>; close(): Promise<void>; }
 * // END INTERFACE FOR INTEGRATION
 */
import type { ActivityAPI, ActivityEvent } from "@diggy/shared";
import { Dexie, type Table } from "dexie";

import { createRedactor, type SecretsInput } from "./redact.js";

export interface ActivityLogOptions {
  /** Injectable clock (tests). Default: `Date.now`. */
  now?: () => number;
  /** Injectable id factory (tests). Default: `ev_<epoch>_<counter>`. */
  idFactory?: () => string;
  /** Locked values to scrub to `{{LOCKED:key}}` tokens before writing. */
  secrets?: SecretsInput;
  /** IndexedDB database name. Default: `"diggy-activity"`. */
  dbName?: string;
  /** When `false`, skips IndexedDB entirely (memory only). Default: `true`. */
  persistent?: boolean;
}

export type ActivityListOptions = NonNullable<Parameters<ActivityAPI["list"]>[0]>;

interface EventRow {
  id: string;
  event: ActivityEvent;
}

/** In-memory sink: the synchronous source of truth for `list()` / `onRecord()`. */
export class MemoryActivitySink {
  readonly events: ActivityEvent[] = [];

  write(event: ActivityEvent): void {
    this.events.push(structuredClone(event));
  }

  clear(): void {
    this.events.length = 0;
  }
}

/**
 * IndexedDB sink (browser + Node tests via `fake-indexeddb`). One row per
 * event in an `events` table keyed by `id`.
 */
export class IndexedDbActivitySink {
  private readonly db: Dexie & { events: Table<EventRow, string> };

  constructor(dbName = "diggy-activity") {
    const db = new Dexie(dbName) as Dexie & { events: Table<EventRow, string> };
    db.version(1).stores({ events: "id" });
    this.db = db;
  }

  async write(event: ActivityEvent): Promise<void> {
    await this.db.events.put({ id: event.id, event: structuredClone(event) });
  }

  async readAll(): Promise<ActivityEvent[]> {
    const rows = await this.db.events.toArray();
    return rows.map((row) => row.event);
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

export type ActivityLog = ActivityAPI & {
  /** Resolves once the IndexedDB backfill has landed in memory. */
  readonly ready: Promise<void>;
  /** Drains pending IndexedDB writes. */
  flush(): Promise<void>;
  /** Flushes and releases the IndexedDB handle. */
  close(): Promise<void>;
};

export function createActivityLog(options: ActivityLogOptions = {}): ActivityLog {
  const now = options.now ?? (() => Date.now());
  const persistent = options.persistent ?? true;
  const memory = new MemoryActivitySink();
  const store = persistent ? new IndexedDbActivitySink(options.dbName) : null;
  const handlers = new Set<(event: ActivityEvent) => void>();
  const seen = new Set<string>();
  let counter = 0;
  const idFactory =
    options.idFactory ??
    (() => {
      counter += 1;
      return `ev_${now()}_${counter}`;
    });

  // Ordered chain of pending IndexedDB writes; a rejected write must never
  // break the chain (memory stays authoritative).
  let pending: Promise<void> = Promise.resolve();
  const persist = (event: ActivityEvent): void => {
    if (!store) return;
    const snapshot = structuredClone(event);
    pending = pending
      .then(() => store.write(snapshot))
      .catch(() => undefined);
  };

  const ingest = (event: ActivityEvent): void => {
    if (seen.has(event.id)) return;
    seen.add(event.id);
    memory.write(event);
    for (const handler of [...handlers]) {
      try {
        handler(structuredClone(event));
      } catch {
        /* a broken subscriber must never break the log */
      }
    }
  };

  const ready: Promise<void> = (async () => {
    if (!store) return;
    try {
      const stored = await store.readAll();
      stored.sort((a, b) => a.at - b.at);
      for (const event of stored) ingest(event);
    } catch {
      /* IndexedDB unavailable — memory remains the source of truth */
    }
  })();

  const redactorOf = (): ReturnType<typeof createRedactor> => createRedactor(options.secrets);

  return {
    ready,

    record(event): ActivityEvent {
      const clean = redactorOf().redact({
        title: event.title,
        detail: event.detail,
        meta: event.meta,
      });
      const stored: ActivityEvent = {
        id: idFactory(),
        kind: event.kind,
        title: clean.title,
        ...(clean.detail === undefined ? {} : { detail: clean.detail }),
        ...(clean.meta === undefined ? {} : { meta: clean.meta }),
        at: event.at ?? now(),
      };
      ingest(stored);
      persist(stored);
      return structuredClone(stored);
    },

    async list(opts: ActivityListOptions = {}): Promise<ActivityEvent[]> {
      await ready;
      const since = opts.since;
      const limit = opts.limit;
      let events = memory.events.map((event) => structuredClone(event));
      events.sort((a, b) => a.at - b.at);
      if (since !== undefined) {
        events = events.filter((event) => event.at >= since);
      }
      if (limit !== undefined) {
        events = events.slice(0, Math.max(0, limit));
      }
      return events;
    },

    onRecord(handler: (event: ActivityEvent) => void): () => void {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },

    async flush(): Promise<void> {
      await ready;
      await pending;
    },

    async close(): Promise<void> {
      await pending.catch(() => undefined);
      await store?.close().catch(() => undefined);
    },
  };
}
