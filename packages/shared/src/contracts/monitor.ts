/**
 * Monitor Engine contract — DIGGY's main USP.
 * Owning worker: monitor (`packages/monitor`, `services/crawler`).
 */

export type MonitorKind =
  | "content_change"
  | "keyword"
  | "new_post"
  | "registration_open"
  | "deadline_change"
  | "release_published"
  | "price_change"
  | "custom";

export interface WatchSpec {
  id: string;
  url: string;
  kind: MonitorKind;
  /** Query / rule for keyword and custom watches. */
  query?: string;
  /** Polling interval in seconds (30-3600). */
  intervalSec: number;
  /** Keep firing after a match (webbrain `--keep` semantics). */
  keep?: boolean;
  createdAt: number;
}

export interface MonitorEvent {
  id: string;
  watchId: string;
  url: string;
  kind: MonitorKind;
  /** Stable key used to dedupe repeated alerts for the same underlying event. */
  eventKey: string;
  title: string;
  summary: string;
  /** Raw evidence: changed text, matched snippet, or snapshot reference. */
  evidence: string;
  detectedAt: number;
  severity: "info" | "low" | "medium" | "high" | "critical";
}

export interface MonitorAPI {
  add(spec: Omit<WatchSpec, "id" | "createdAt">): Promise<WatchSpec>;
  remove(id: string): Promise<void>;
  list(): Promise<WatchSpec[]>;
  /** Baseline on first check, then dedupe stable events. */
  check(id: string): Promise<MonitorEvent[]>;
  onChange(handler: (event: MonitorEvent) => void): () => void;
}
