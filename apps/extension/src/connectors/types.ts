/**
 * Connector contracts for the extension's integrations layer.
 *
 * One module per service lives beside this file; `index.ts` exposes the
 * single `createConnectors()` factory the background calls. Tokens stay in
 * `browser.storage.local` under per-service keys and are never returned to
 * the UI — only `connected | disconnected | error` leaves this layer.
 *
 * // INTERFACE FOR INTEGRATION
 * interface Connector { id: string; label: string; category: ConnectorCategory;
 *   status(): Promise<ConnectorStatus>;
 *   connect(): Promise<ConnectResult>;
 *   disconnect(): Promise<void> }
 * function createConnectors(): Connector[]
 * // END INTERFACE FOR INTEGRATION
 */

export type ConnectorCategory = "Productivity" | "Development" | "Social";

export type ConnectorStatus = "connected" | "disconnected" | "error";

export interface ConnectResult {
  ok: boolean;
  error?: string;
}

export interface Connector {
  id: string;
  label: string;
  category: ConnectorCategory;
  status(): Promise<ConnectorStatus>;
  connect(): Promise<ConnectResult>;
  disconnect(): Promise<void>;
}
