/**
 * The Monitor Engine — DIGGY's main USP.
 *
 * Implements the shared {@link MonitorAPI} contract, plus the scheduler
 * surface. One `check(id)` runs:
 *
 *   source.fetch → **baseline on first check** → kind-specific diff →
 *   **AI analysis** (`@diggy/core`) → {@link MonitorEvent} → notify → avatar alert
 *
 * Dedupe is by `eventKey`: a stable event alerts exactly once. A non-`keep`
 * watch disarms after it fires; a `keep` watch stays armed and re-arms keyword /
 * registration watches once the condition clears.
 */
import type { MonitorAPI, MonitorEvent, WatchSpec } from "@diggy/shared";
import { analyzeDetection, createCoreAnalyzer, type Analyzer } from "./analyzer.js";
import { createNoopAvatarAlerter, type AvatarAlerter } from "./avatar-alert.js";
import { createNoopNotifier, type Notifier } from "./notify.js";
import type { SchedulableEngine } from "./scheduler.js";
import type { Source } from "./source.js";
import { WatchStore, evaluateWatch } from "./watches.js";

/** Options for {@link createMonitorEngine}. */
export interface MonitorEngineOptions {
  /** How a watch is turned into a snapshot (network boundary). */
  source: Source;
  /** Watch/state store (default: in-memory). */
  store?: WatchStore;
  /** Analysis implementation (default: `@diggy/core`, heuristic fallback). */
  analyzer?: Analyzer;
  /** Delivery (default: noop). */
  notifier?: Notifier;
  /** Avatar reactions (default: noop). */
  avatar?: AvatarAlerter;
  now?: () => number;
  idFactory?: () => string;
}

/** The engine surface: the contract + scheduling helpers. */
export interface MonitorEngine extends MonitorAPI, SchedulableEngine {
  /** Check every watch; returns all events emitted. */
  checkAll(): Promise<MonitorEvent[]>;
  /** Re-arm a spent watch so a later change can alert again. */
  rearm(id: string): Promise<void>;
  /** The underlying store (for the host to persist / inspect). */
  readonly store: WatchStore;
}

function defaultId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Build a monitor engine. */
export function createMonitorEngine(options: MonitorEngineOptions): MonitorEngine {
  const store = options.store ?? new WatchStore();
  const analyzer = options.analyzer ?? createCoreAnalyzer();
  const notifier = options.notifier ?? createNoopNotifier();
  const avatar = options.avatar ?? createNoopAvatarAlerter();
  const now = options.now ?? (() => Date.now());
  const idFactory = options.idFactory ?? defaultId;

  const handlers = new Set<(event: MonitorEvent) => void>();
  const inFlight = new Map<string, Promise<MonitorEvent[]>>();

  function emit(event: MonitorEvent): void {
    for (const handler of handlers) {
      try {
        handler(event);
      } catch {
        /* a listener throwing must not break a check */
      }
    }
  }

  async function runCheck(id: string): Promise<MonitorEvent[]> {
    const record = await store.get(id);
    if (!record) return [];

    const snapshot = await options.source.fetch(record.spec);
    const at = now();
    const { detection, state } = evaluateWatch(record.spec, record.state, snapshot, at);

    await store.setState(id, state);
    if (!detection) return [];

    const analysis = await analyzeDetection(
      analyzer,
      record.spec.url,
      detection,
      record.state.lastText ?? undefined,
      snapshot.text,
    );

    const event: MonitorEvent = {
      id: idFactory(),
      watchId: record.spec.id,
      url: record.spec.url,
      kind: detection.kind,
      eventKey: detection.eventKey,
      title: analysis.title,
      summary: analysis.summary,
      evidence: detection.evidence,
      detectedAt: at,
      severity: analysis.severity,
    };

    emit(event);
    try {
      await notifier.notify(event);
    } catch {
      /* delivery is best-effort */
    }
    avatar.alert(event);
    return [event];
  }

  function check(id: string): Promise<MonitorEvent[]> {
    const existing = inFlight.get(id);
    if (existing) return existing;
    const promise = runCheck(id).finally(() => {
      inFlight.delete(id);
    });
    inFlight.set(id, promise);
    return promise;
  }

  return {
    store,

    async add(input): Promise<WatchSpec> {
      return store.add(input, { id: `watch-${idFactory()}`, now: now() });
    },

    async remove(id): Promise<void> {
      await store.remove(id);
    },

    async list(): Promise<WatchSpec[]> {
      return store.list();
    },

    check,

    async checkAll(): Promise<MonitorEvent[]> {
      const events: MonitorEvent[] = [];
      for (const spec of await store.list()) {
        try {
          events.push(...(await check(spec.id)));
        } catch {
          /* one failing watch must not stop the rest */
        }
      }
      return events;
    },

    async due(at: number): Promise<WatchSpec[]> {
      const dueWatches: WatchSpec[] = [];
      for (const record of await store.all()) {
        const last = record.state.lastCheckedAt;
        const intervalMs = record.spec.intervalSec * 1000;
        if (last === null || at - last >= intervalMs) dueWatches.push(record.spec);
      }
      return dueWatches;
    },

    async rearm(id: string): Promise<void> {
      await store.rearm(id);
    },

    onChange(handler: (event: MonitorEvent) => void): () => void {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
  };
}
