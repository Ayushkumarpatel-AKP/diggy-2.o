/**
 * `@diggy/activity` — the Activity Center log.
 *
 * Append-only transparency record of what DIGGY read, filled, opened,
 * monitored and changed. Ported from the seed agent's typed activity log
 * (`packages/agent/src/activity.ts`: `ActivityEvent` / `ActivitySink`) onto
 * the DIGGY 2.0 `ActivityAPI` contract in `@diggy/shared`.
 *
 * // INTERFACE FOR INTEGRATION (public surface — repeat, keep in sync)
 * //   contracts (re-exported from @diggy/shared):
 * //     import type { ActivityEvent, ActivityKind, ActivityAPI } from "@diggy/activity";
 * //
 * //   redaction (./redact.js):
 * //     lockedToken(key: string): string
 * //     parseLockedToken(value: unknown): string | null
 * //     findTokenKeys(value: unknown): string[]
 * //     createRedactor(secrets?: SecretsInput): Redactor
 * //     type LockedSecret = { key: string; value: string }  // value "" = key-based only
 * //     type SecretsInput = Record<string,string> | LockedSecret[] | (() => Record<string,string> | LockedSecret[])
 * //
 * //   log (./store.js):
 * //     createActivityLog(options?: ActivityLogOptions): ActivityLog
 * //     interface ActivityLogOptions { now?; idFactory?; secrets?; dbName?; persistent? }
 * //     type ActivityLog = ActivityAPI & { readonly ready: Promise<void>; flush(): Promise<void>; close(): Promise<void> }
 * //     class MemoryActivitySink { events: ActivityEvent[]; write(e): void; clear(): void }
 * //     class IndexedDbActivitySink { write(e): Promise<void>; readAll(): Promise<ActivityEvent[]>; close(): Promise<void> }
 * //
 * //   bridge (./bridge.js):
 * //     wireActivityBus(bus: MessageBus, log: ActivityAPI): () => void
 * // END INTERFACE FOR INTEGRATION
 */
export type { ActivityAPI, ActivityEvent, ActivityKind } from "@diggy/shared";

export * from "./redact.js";
export * from "./store.js";
export * from "./bridge.js";
