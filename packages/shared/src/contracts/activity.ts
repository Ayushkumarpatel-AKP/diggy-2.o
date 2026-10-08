/**
 * Activity Center contract — full transparency of what DIGGY did.
 * Owning worker: activity (`packages/activity`).
 */

export type ActivityKind =
  | "read_page"
  | "summary"
  | "filled_form"
  | "opened_site"
  | "monitored"
  | "action"
  | "alert"
  | "integration"
  | "voice"
  | "error";

export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  title: string;
  detail?: string;
  /** Tokens only — never locked plaintext. */
  meta?: Record<string, string>;
  at: number;
}

export interface ActivityAPI {
  record(event: Omit<ActivityEvent, "id" | "at"> & { at?: number }): ActivityEvent;
  list(opts?: { since?: number; limit?: number }): Promise<ActivityEvent[]>;
  onRecord(handler: (event: ActivityEvent) => void): () => void;
}
