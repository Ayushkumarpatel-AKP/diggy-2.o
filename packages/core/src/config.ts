/**
 * @diggy/core — runtime tuning constants.
 *
 * ONE HOME RULE: every magic number lives here and nowhere else. Change a value
 * here and every consumer follows. This module is deliberately dependency-free:
 * plain numbers and strings, no DOM, no network, no `chrome` — so it imports
 * safely in the MV3 service worker, the desktop brain, the crawler and Vitest.
 */

/** The three agent modes, each with its own deterministic temperature. */
export type AgentMode = "browser-control" | "ask" | "vision";

/**
 * Deterministic default temperatures per mode (from the brief):
 * browser-control 0.15, ask 0.3, vision 0.
 */
export const MODE_TEMPERATURES: Readonly<Record<AgentMode, number>> = Object.freeze({
  "browser-control": 0.15,
  ask: 0.3,
  vision: 0,
});

/** Agent run loop. */
export const BRAIN = Object.freeze({
  /** Default step budget for a single run. */
  defaultStepBudget: 130,
  /** Absolute ceiling a caller cannot raise past. */
  hardStepBudget: 195,
  /** Default planner temperature. */
  plannerTemperature: 0.2,
  /** Default max tokens for a single completion. */
  defaultMaxTokens: 2048,
  /** Wall-clock ceiling for one run (ms). */
  wallClockMs: 5 * 60 * 1000,
});

/** Provider failover + reliability. */
export const RELIABILITY = Object.freeze({
  /** Retries *after* the first attempt, per provider. */
  maxRetries: 2,
  /** Base delay for exponential backoff (ms). */
  baseDelayMs: 250,
  /** Cap on a single backoff delay (ms). */
  maxDelayMs: 4_000,
  /** How long a hard-failed provider is skipped before it is retried (ms). */
  unhealthyCooldownMs: 60_000,
  /** How long a rate-limited / quota-exhausted provider is skipped (ms). */
  exhaustedCooldownMs: 5 * 60 * 1000,
  /** How long a cached `health()` result is trusted (ms). */
  healthCacheMs: 30_000,
  /** Timeout for a single `health()` probe (ms). */
  healthTimeoutMs: 5_000,
});

/**
 * Approximate pricing in USD per 1M tokens.
 *
 * These are placeholders so cost accounting has a default home — the host may
 * inject a live table. Matching is exact on the model id, then by prefix so
 * dated snapshots (`…-0917`) inherit their family price.
 */
export const DEFAULT_COST_TABLE: Readonly<Record<string, { inputPer1M: number; outputPer1M: number }>> =
  Object.freeze({
    "openai/gpt-oss-120b": { inputPer1M: 0.15, outputPer1M: 0.75 },
    "openai/gpt-oss-20b": { inputPer1M: 0.05, outputPer1M: 0.25 },
    "whisper-large-v3": { inputPer1M: 0, outputPer1M: 0 },
  });

/** Smart-context compaction. */
export const CONTEXT = Object.freeze({
  /** Default ceiling for a prompt, in estimated tokens. */
  maxTokens: 24_000,
  /** Trailing messages never folded away. */
  keepRecent: 6,
  /** Hard character cap for a single tool result. */
  maxToolResultChars: 4_000,
  /** Character reserve held back for the truncation marker. */
  truncationMarkerReserve: 48,
  /** Rough characters-per-token ratio used for estimation. */
  charsPerToken: 4,
});

/** Per-tab conversation window. */
export const CONVERSATION = Object.freeze({
  maxMessages: 40,
  maxChars: 24_000,
});
