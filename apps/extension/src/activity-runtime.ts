/**
 * Activity runtime — the extension-side factory over `@diggy/activity`.
 *
 * Built on the package's real `createActivityLog()` + `wireActivityBus(bus,
 * log)`. `record` delegates to the log (which already redacts locked values);
 * `list` / `onRecord` delegate to the log's methods.
 *
 * // INTERFACE FOR INTEGRATION
 * //   interface ActivityRuntime {
 * //     record(event: Omit<ActivityEvent, "id" | "at"> & { at?: number }): ActivityEvent;
 * //     list(options?: { since?: number; limit?: number }): Promise<ActivityEvent[]>;
 * //     onRecord(handler: (event: ActivityEvent) => void): () => void;
 * //   }
 * //   function createActivityRuntime(bus: MessageBus): ActivityRuntime
 * // END INTERFACE FOR INTEGRATION
 */
import type { ActivityEvent, MessageBus } from "@diggy/shared";
import { createActivityLog, wireActivityBus } from "@diggy/activity";

export interface ActivityRuntime {
  record(event: Omit<ActivityEvent, "id" | "at"> & { at?: number }): ActivityEvent;
  list(options?: { since?: number; limit?: number }): Promise<ActivityEvent[]>;
  onRecord(handler: (event: ActivityEvent) => void): () => void;
}

export function createActivityRuntime(bus: MessageBus): ActivityRuntime {
  const log = createActivityLog();
  wireActivityBus(bus, log);
  return {
    record: (event) => log.record(event),
    list: (options) => log.list(options),
    onRecord: (handler) => log.onRecord(handler),
  };
}
