/**
 * MessageBus implementation for `@diggy/shared`.
 * Owning worker: core.
 *
 * // INTERFACE FOR INTEGRATION
 * createBus(opts?: CreateBusOptions): MessageBus
 *   interface CreateBusOptions {
 *     source?: BusSource;              // default "background"
 *     now?: () => number;              // injectable clock (tests)
 *     transport?: BusTransport;        // optional cross-context relay
 *   }
 *   interface BusTransport {
 *     broadcast(event: BusEvent): void;
 *     subscribe(handler: (event: BusEvent) => void): () => void;
 *   }
 *   emit<T>(type: string, payload: T): void
 *   on<T>(type: string, handler: BusHandler<T>): () => void   // returns unsubscribe
 * // END INTERFACE FOR INTEGRATION
 */
import type { BusEvent, BusHandler, BusSource, MessageBus } from "./contracts/bus.js";

export interface BusTransport {
  /** Send a locally-emitted event to every other context. */
  broadcast(event: BusEvent): void;
  /** Receive events emitted by other contexts; returns unsubscribe. */
  subscribe(handler: (event: BusEvent) => void): () => void;
}

export interface CreateBusOptions {
  source?: BusSource;
  now?: () => number;
  transport?: BusTransport;
}

export function createBus(opts: CreateBusOptions = {}): MessageBus {
  const source: BusSource = opts.source ?? "background";
  const now = opts.now ?? (() => Date.now());
  const handlers = new Map<string, Set<BusHandler>>();

  const dispatch = (event: BusEvent): void => {
    const set = handlers.get(event.type);
    if (!set) return;
    for (const handler of [...set]) {
      handler(event);
    }
  };

  if (opts.transport) {
    opts.transport.subscribe(dispatch);
  }

  return {
    emit<T>(type: string, payload: T): void {
      const event: BusEvent<T> = { type, source, payload, at: now() };
      dispatch(event as BusEvent);
      opts.transport?.broadcast(event as BusEvent);
    },
    on<T>(type: string, handler: BusHandler<T>): () => void {
      let set = handlers.get(type);
      if (!set) {
        set = new Set();
        handlers.set(type, set);
      }
      set.add(handler as BusHandler);
      return () => {
        set.delete(handler as BusHandler);
        if (set.size === 0) handlers.delete(type);
      };
    },
  };
}
