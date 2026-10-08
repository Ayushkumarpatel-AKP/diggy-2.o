/**
 * Watched-site store + `MonitorKind` detection.
 *
 * Ported (and hardened) from the proven `apps/extension/src/watches.ts` hash /
 * keyword diff, widened to the full {@link MonitorKind} set from the shared
 * contract. The store keeps the user's {@link WatchSpec}s *and* the internal
 * detection {@link WatchState} (baseline hash, last price/deadline/version,
 * seen event keys) so a check is a pure function of `(spec, state, snapshot)`.
 *
 * Nothing here touches the network or `chrome`; persistence is an injected
 * {@link WatchPersistence} so the same store runs in a service worker, the
 * server-side scheduler and Vitest.
 */
import type { MonitorKind, WatchSpec } from "@diggy/shared";

export type { MonitorKind, WatchSpec };

/** Maximum number of watches a user may keep. */
export const MAX_WATCHES = 50;

/** Polling-interval bounds (seconds), enforced on {@link validateSpec}. */
export const MIN_INTERVAL_SEC = 30;
export const MAX_INTERVAL_SEC = 3600;

/** Event severity, mirrored from the shared `MonitorEvent`. */
export type Severity = "info" | "low" | "medium" | "high" | "critical";

/** The raw material a check evaluates: extracted page text + adapter signals. */
export interface PageSnapshot {
  url: string;
  title: string;
  /** Cleaned, readable text (Markdown is fine). */
  text: string;
  /** Posts/releases discovered on the page or its feed. */
  posts?: { id: string; title: string; url: string }[];
  /** Price in minor units (from a site adapter). */
  price?: number;
  /** Normalised deadline token (from a site adapter). */
  deadline?: string;
  /** Registration-open flag (from a site adapter). */
  registrationOpen?: boolean;
  /** Release/version string (from a site adapter). */
  version?: string;
}

/** Persisted detection state for one watch (never exposed as product data). */
export interface WatchState {
  /** `true` once the first (baseline) check has run. */
  baseline: boolean;
  /** `false` once a non-`keep` watch has fired and is spent. */
  armed: boolean;
  lastCheckedAt: number | null;
  lastHash: string | null;
  /** Capped copy of the last text (evidence / AI analysis input). */
  lastText: string | null;
  lastPrice: number | null;
  lastDeadline: string | null;
  lastRegistrationOpen: boolean | null;
  lastVersion: string | null;
  lastCustomMatch: string | null;
  /** Known post/release ids, for `new_post` detection. */
  postIds: string[];
  /** Whether the keyword was present on the last check (transition detection). */
  keywordPresent: boolean;
  /** eventKeys already alerted, so stable events fire exactly once. */
  seenEventKeys: string[];
}

/** A spec paired with its detection state — the unit the store persists. */
export interface WatchRecord {
  spec: WatchSpec;
  state: WatchState;
}

/** Injected persistence (service worker storage, JSON file, in-memory, …). */
export interface WatchPersistence {
  load(): Promise<WatchRecord[]>;
  save(records: WatchRecord[]): Promise<void>;
}

/** A detected change, before it becomes an analysed {@link MonitorEvent}. */
export interface Detection {
  kind: MonitorKind;
  eventKey: string;
  title: string;
  summary: string;
  evidence: string;
  severity: Severity;
}

/** Result of {@link evaluateWatch}. */
export interface EvaluateResult {
  detection: Detection | null;
  state: WatchState;
  changed: boolean;
}

/** Fresh, un-baselined state for a newly added watch. */
export function createWatchState(): WatchState {
  return {
    baseline: false,
    armed: true,
    lastCheckedAt: null,
    lastHash: null,
    lastText: null,
    lastPrice: null,
    lastDeadline: null,
    lastRegistrationOpen: null,
    lastVersion: null,
    lastCustomMatch: null,
    postIds: [],
    keywordPresent: false,
    seenEventKeys: [],
  };
}

/** Cap kept text so state stays small in `chrome.storage`. */
export const MAX_STATE_TEXT = 4000;

/** Collapse all whitespace runs to single spaces and trim. */
export function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function cap(text: string, max = MAX_STATE_TEXT): string {
  return text.length > max ? text.slice(0, max) : text;
}

/**
 * Synchronous, dependency-free string hash (cyrb53). Deterministic across the
 * service worker, Node and Vitest — no WebCrypto, so `check()` stays sync-fast.
 */
export function hashText(input: string, seed = 0): string {
  let h1 = 0xdead_beef ^ seed;
  let h2 = 0x41c6_ce57 ^ seed;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hi = (h2 >>> 0).toString(16).padStart(8, "0");
  const lo = (h1 >>> 0).toString(16).padStart(8, "0");
  return `${hi}${lo}`;
}

/** Stable eventKey from its parts (colon-joined, non-empty). */
export function makeEventKey(watchId: string, ...parts: (string | number)[]): string {
  return ["m", watchId, ...parts.map(String)].join(":");
}

/** Default severity per kind (the AI analyzer may override). */
export function severityForKind(kind: MonitorKind): Severity {
  switch (kind) {
    case "registration_open":
    case "deadline_change":
      return "critical";
    case "keyword":
    case "release_published":
      return "high";
    case "price_change":
    case "new_post":
      return "medium";
    case "content_change":
    case "custom":
    default:
      return "low";
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** A short snippet around `needle`, or the head of the text. */
export function snippetAround(text: string, needle: string | undefined, radius = 160): string {
  if (!text) return "";
  if (!needle) return cap(text, radius * 2);
  const at = text.toLowerCase().indexOf(needle.toLowerCase());
  if (at === -1) return cap(text, radius * 2);
  const start = Math.max(0, at - radius);
  const end = Math.min(text.length, at + needle.length + radius);
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

/** Validate a new spec, throwing a clear message on anything malformed. */
export function validateSpec(spec: Omit<WatchSpec, "id" | "createdAt">): void {
  const url = spec.url?.trim();
  if (!url) throw new Error("Watch url is required.");
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("unsupported scheme");
    }
  } catch {
    throw new Error(`Watch url must be an absolute http(s) URL: ${spec.url}`);
  }
  if (!Number.isFinite(spec.intervalSec) || spec.intervalSec < MIN_INTERVAL_SEC || spec.intervalSec > MAX_INTERVAL_SEC) {
    throw new Error(`Watch intervalSec must be between ${MIN_INTERVAL_SEC} and ${MAX_INTERVAL_SEC}.`);
  }
  if ((spec.kind === "keyword" || spec.kind === "custom") && !spec.query?.trim()) {
    throw new Error(`A "${spec.kind}" watch requires a query.`);
  }
}

/**
 * Evaluate one watch against a fresh snapshot.
 *
 * The first call only **establishes the baseline** (no event). Later calls run
 * the kind-specific diff, dedupe by {@link Detection.eventKey}, and — when the
 * watch is not `keep` — disarm after the first alert. `keep` watches stay armed
 * and re-arm keyword/registration watches once the condition clears.
 */
export function evaluateWatch(
  spec: WatchSpec,
  state: WatchState,
  snapshot: PageSnapshot,
  now: number,
): EvaluateResult {
  const text = normalizeText(snapshot.text);
  const hash = hashText(text);
  const host = hostOf(spec.url);
  const posts = snapshot.posts ?? [];
  const postIds = posts.map((post) => post.id);

  // ── first check: baseline, no event ─────────────────────────────────────
  if (!state.baseline) {
    const keywordPresent = keywordIsPresent(spec, text);
    return {
      detection: null,
      changed: false,
      state: {
        ...state,
        baseline: true,
        armed: true,
        lastCheckedAt: now,
        lastHash: hash,
        lastText: cap(snapshot.text),
        lastPrice: snapshot.price ?? null,
        lastDeadline: snapshot.deadline ?? null,
        lastRegistrationOpen: snapshot.registrationOpen ?? null,
        lastVersion: snapshot.version ?? null,
        lastCustomMatch: customMatch(spec, text),
        postIds,
        keywordPresent,
        seenEventKeys: [],
      },
    };
  }

  const canFire = state.armed;
  const seen = new Set(state.seenEventKeys);
  const keep = spec.keep === true;

  let detection: Detection | null = null;
  let nextKeywordPresent = state.keywordPresent;
  let nextCustomMatch = state.lastCustomMatch;

  switch (spec.kind) {
    case "content_change": {
      if (hash !== state.lastHash && canFire) {
        const key = makeEventKey(spec.id, "content", hash);
        if (!seen.has(key)) {
          detection = {
            kind: spec.kind,
            eventKey: key,
            title: snapshot.title || host,
            summary: `Page changed on ${host}.`,
            evidence: snippetAround(snapshot.text, undefined),
            severity: severityForKind(spec.kind),
          };
        }
      }
      break;
    }

    case "keyword": {
      const query = (spec.query ?? "").trim();
      const present = keywordIsPresent(spec, text);
      const key = makeEventKey(spec.id, "keyword", query.toLowerCase());
      if (present && !state.keywordPresent && canFire && !seen.has(key)) {
        detection = {
          kind: spec.kind,
          eventKey: key,
          title: snapshot.title || host,
          summary: `Keyword "${query}" appeared on ${host}.`,
          evidence: snippetAround(snapshot.text, query),
          severity: severityForKind(spec.kind),
        };
      }
      // `keep` re-arms once the keyword disappears again.
      if (!present && keep) seen.delete(key);
      nextKeywordPresent = present;
      break;
    }

    case "new_post": {
      const fresh = posts.filter((post) => !state.postIds.includes(post.id));
      if (fresh.length > 0 && canFire) {
        const newest = fresh[0];
        if (newest) {
          const key = makeEventKey(spec.id, "post", newest.id);
          if (!seen.has(key)) {
            detection = {
              kind: spec.kind,
              eventKey: key,
              title: snapshot.title || host,
              summary: `New post on ${host}: ${newest.title}.`,
              evidence: `${newest.title} — ${newest.url}`,
              severity: severityForKind(spec.kind),
            };
          }
        }
      }
      break;
    }

    case "registration_open": {
      const open = snapshot.registrationOpen ?? false;
      const key = makeEventKey(spec.id, "registration", "open");
      if (open && state.lastRegistrationOpen !== true && canFire && !seen.has(key)) {
        detection = {
          kind: spec.kind,
          eventKey: key,
          title: snapshot.title || host,
          summary: `Registration looks open on ${host}.`,
          evidence: snippetAround(snapshot.text, "apply"),
          severity: severityForKind(spec.kind),
        };
      }
      if (!open && keep) seen.delete(key);
      break;
    }

    case "deadline_change": {
      const deadline = snapshot.deadline;
      if (deadline && deadline !== state.lastDeadline && canFire) {
        const key = makeEventKey(spec.id, "deadline", deadline);
        if (!seen.has(key)) {
          detection = {
            kind: spec.kind,
            eventKey: key,
            title: snapshot.title || host,
            summary: `Deadline on ${host} is now ${deadline}.`,
            evidence: snippetAround(snapshot.text, deadline),
            severity: severityForKind(spec.kind),
          };
        }
      }
      break;
    }

    case "price_change": {
      const price = snapshot.price;
      if (price !== undefined && price !== state.lastPrice && canFire) {
        const key = makeEventKey(spec.id, "price", price);
        if (!seen.has(key)) {
          detection = {
            kind: spec.kind,
            eventKey: key,
            title: snapshot.title || host,
            summary: `Price on ${host} changed to ${price}.`,
            evidence: snippetAround(snapshot.text, String(price)),
            severity: severityForKind(spec.kind),
          };
        }
      }
      break;
    }

    case "release_published": {
      const version = snapshot.version;
      if (version && version !== state.lastVersion && canFire) {
        const key = makeEventKey(spec.id, "release", version);
        if (!seen.has(key)) {
          detection = {
            kind: spec.kind,
            eventKey: key,
            title: snapshot.title || host,
            summary: `Release ${version} published on ${host}.`,
            evidence: snippetAround(snapshot.text, version),
            severity: severityForKind(spec.kind),
          };
        }
      }
      break;
    }

    case "custom": {
      const match = customMatch(spec, text);
      nextCustomMatch = match;
      if (match && match !== state.lastCustomMatch && canFire) {
        const key = makeEventKey(spec.id, "custom", hashText(match));
        if (!seen.has(key)) {
          detection = {
            kind: spec.kind,
            eventKey: key,
            title: snapshot.title || host,
            summary: `Custom rule matched on ${host}.`,
            evidence: snippetAround(snapshot.text, match),
            severity: severityForKind(spec.kind),
          };
        }
      }
      break;
    }
  }

  if (detection) {
    seen.add(detection.eventKey);
  }

  // A non-`keep` watch disarms once it fires; otherwise the armed flag carries.
  const armed = detection ? keep : state.armed;

  return {
    detection,
    changed: hash !== state.lastHash,
    state: {
      ...state,
      baseline: true,
      armed,
      lastCheckedAt: now,
      lastHash: hash,
      lastText: cap(snapshot.text),
      lastPrice: snapshot.price ?? state.lastPrice,
      lastDeadline: snapshot.deadline ?? state.lastDeadline,
      lastRegistrationOpen: snapshot.registrationOpen ?? state.lastRegistrationOpen,
      lastVersion: snapshot.version ?? state.lastVersion,
      lastCustomMatch: nextCustomMatch,
      postIds: [...new Set([...postIds, ...state.postIds])].slice(0, 200),
      keywordPresent: nextKeywordPresent,
      seenEventKeys: [...seen].slice(-200),
    },
  };
}

function keywordIsPresent(spec: WatchSpec, text: string): boolean {
  const query = (spec.query ?? "").trim().toLowerCase();
  return query.length > 0 && text.toLowerCase().includes(query);
}

function customMatch(spec: WatchSpec, text: string): string | null {
  const rule = spec.query?.trim();
  if (!rule) return null;
  try {
    const match = new RegExp(rule, "i").exec(text);
    return match ? match[1] ?? match[0] : null;
  } catch {
    return null;
  }
}

/** In-memory {@link WatchPersistence} (the default; survives for the process). */
export class MemoryWatchPersistence implements WatchPersistence {
  private records: WatchRecord[] = [];

  async load(): Promise<WatchRecord[]> {
    return this.records.map((record) => structuredClone(record));
  }

  async save(records: WatchRecord[]): Promise<void> {
    this.records = records.map((record) => structuredClone(record));
  }
}

/**
 * Watch store enforcing {@link MAX_WATCHES}. Loads lazily from
 * {@link WatchPersistence} (in-memory by default) so every mutation is durable
 * where the caller wired persistence.
 */
export class WatchStore {
  private records: WatchRecord[] = [];
  private loaded = false;

  constructor(private readonly persistence: WatchPersistence = new MemoryWatchPersistence()) {}

  private async ensure(): Promise<void> {
    if (this.loaded) return;
    this.records = await this.persistence.load();
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    await this.persistence.save(this.records);
  }

  async all(): Promise<WatchRecord[]> {
    await this.ensure();
    return this.records.map((record) => structuredClone(record));
  }

  async list(): Promise<WatchSpec[]> {
    await this.ensure();
    return this.records.map((record) => ({ ...record.spec }));
  }

  async get(id: string): Promise<WatchRecord | undefined> {
    await this.ensure();
    const found = this.records.find((record) => record.spec.id === id);
    return found ? structuredClone(found) : undefined;
  }

  async add(
    input: Omit<WatchSpec, "id" | "createdAt">,
    options: { id: string; now: number },
  ): Promise<WatchSpec> {
    await this.ensure();
    validateSpec(input);
    if (this.records.length >= MAX_WATCHES) {
      throw new Error(`You can watch at most ${MAX_WATCHES} sites.`);
    }
    const spec: WatchSpec = { ...input, id: options.id, createdAt: options.now };
    const existing = this.records.findIndex((record) => record.spec.id === spec.id);
    const record: WatchRecord = { spec, state: createWatchState() };
    if (existing >= 0) this.records[existing] = record;
    else this.records.push(record);
    await this.persist();
    return { ...spec };
  }

  async remove(id: string): Promise<void> {
    await this.ensure();
    this.records = this.records.filter((record) => record.spec.id !== id);
    await this.persist();
  }

  /** Replace a record's detection state (after a check). */
  async setState(id: string, state: WatchState): Promise<void> {
    await this.ensure();
    const index = this.records.findIndex((record) => record.spec.id === id);
    const current = this.records[index];
    if (index < 0 || !current) return;
    this.records[index] = { spec: current.spec, state };
    await this.persist();
  }

  /** Re-arm a spent watch so it can alert again. */
  async rearm(id: string): Promise<void> {
    const record = await this.get(id);
    if (!record) return;
    await this.setState(id, { ...record.state, armed: true });
  }
}
