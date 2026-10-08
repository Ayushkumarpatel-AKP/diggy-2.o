/**
 * `FailoverRegistry` — the provider-agnostic failover layer.
 *
 * Implements the `@diggy/shared` `ProviderRegistry` contract and adds the
 * behaviour the product needs:
 *
 *   - **ordered failover chain** — Groq first, NVIDIA NIM next, caller-defined
 *     otherwise; a provider switch is invisible to users (same `ChatResult`);
 *   - **retry with exponential backoff** (per provider), injectable clock+sleep
 *     so it is fully deterministic in tests;
 *   - **health checks** — a stale `health()` probe runs before dispatch, and a
 *     provider that reports `ok:false` (or whose last call failed) is sorted to
 *     the back of the chain and skipped while a healthy one exists;
 *   - **latency + cost accounting** per provider, keyed by provider id or model.
 *
 * Everything is injected (`now`, `sleep`, `fetch` on the providers), so no
 * network is touched in tests.
 */
import type { ChatRequest, ChatResult, Provider, ProviderHealth, ProviderRegistry } from "@diggy/shared";
import { DEFAULT_COST_TABLE, RELIABILITY } from "./config.js";
import { readEnv } from "./env.js";
import { classifyError, ProviderError } from "./errors.js";
import {
  createCatalogProvider,
  defaultFailoverChain,
  getCatalogEntry,
  type CatalogConfig,
} from "./providers/registry-catalog.js";

export interface CostEntry {
  inputPer1M: number;
  outputPer1M: number;
}

/** Cost table keyed by provider id or model id (both are tried). */
export type CostTable = Record<string, CostEntry>;

export interface ProviderMetrics {
  providerId: string;
  /** Dispatch attempts (including retries). */
  attempts: number;
  successes: number;
  failures: number;
  retries: number;
  totalLatencyMs: number;
  lastLatencyMs: number | null;
  /** Mean latency over successful dispatches. */
  avgLatencyMs: number;
  promptTokens: number;
  completionTokens: number;
  /** Accumulated USD cost over successful dispatches. */
  costUsd: number;
  lastError: string | null;
  lastSuccessAt: number | null;
  /** Epoch ms until which this provider is considered unhealthy, or null. */
  unhealthyUntil: number | null;
}

export interface FailoverRegistryOptions {
  providers?: Provider[];
  /** Retries after the first attempt, per provider. Default 2. */
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Jitter fraction (0 = deterministic). Default 0. */
  jitter?: number;
  /** Injectable sleep (tests record delays). */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable clock. */
  now?: () => number;
  costTable?: CostTable;
  /**
   * Resolve the billed model id for a provider (for the cost table). Defaults
   * to the catalog's `defaultModel` for the provider id.
   */
  modelOf?: (provider: Provider) => string | undefined;
  healthCacheMs?: number;
  unhealthyCooldownMs?: number;
  exhaustedCooldownMs?: number;
  /** Run stale health probes before dispatch. Default true. */
  autoHealthCheck?: boolean;
  /** Called when the chain moves from one provider to the next. */
  onSwitch?: (from: string, to: string, error: unknown) => void;
}

export interface ChatOutcome {
  /** The provider that actually answered. */
  provider: Provider;
  result: ChatResult;
}

const RETRYABLE = new Set(["rate-limit", "server", "network", "timeout"]);

function isRetryable(error: unknown): boolean {
  return RETRYABLE.has(classifyError(error));
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Ordered failover registry with retry, health gating and cost/latency stats. */
export class FailoverRegistry implements ProviderRegistry {
  private readonly list: Provider[] = [];
  private readonly stats = new Map<string, ProviderMetrics>();
  private readonly healthCache = new Map<string, { health: ProviderHealth; at: number }>();

  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly jitter: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly costTable: CostTable;
  private readonly modelOf: (provider: Provider) => string | undefined;
  private readonly healthCacheMs: number;
  private readonly unhealthyCooldownMs: number;
  private readonly exhaustedCooldownMs: number;
  private readonly autoHealthCheck: boolean;
  private readonly onSwitch: ((from: string, to: string, error: unknown) => void) | undefined;

  constructor(options: FailoverRegistryOptions = {}) {
    this.maxRetries = Math.max(0, options.maxRetries ?? RELIABILITY.maxRetries);
    this.baseDelayMs = Math.max(0, options.baseDelayMs ?? RELIABILITY.baseDelayMs);
    this.maxDelayMs = Math.max(0, options.maxDelayMs ?? RELIABILITY.maxDelayMs);
    this.jitter = Math.max(0, options.jitter ?? 0);
    this.sleep = options.sleep ?? defaultSleep;
    this.now = options.now ?? (() => Date.now());
    this.costTable = options.costTable ?? DEFAULT_COST_TABLE;
    this.modelOf =
      options.modelOf ?? ((provider) => getCatalogEntry(provider.id)?.defaultModel);
    this.healthCacheMs = Math.max(0, options.healthCacheMs ?? RELIABILITY.healthCacheMs);
    this.unhealthyCooldownMs = Math.max(0, options.unhealthyCooldownMs ?? RELIABILITY.unhealthyCooldownMs);
    this.exhaustedCooldownMs = Math.max(0, options.exhaustedCooldownMs ?? RELIABILITY.exhaustedCooldownMs);
    this.autoHealthCheck = options.autoHealthCheck ?? true;
    this.onSwitch = options.onSwitch;

    for (const provider of options.providers ?? []) this.register(provider);
  }

  // ── ProviderRegistry ──────────────────────────────────────────────────────

  register(provider: Provider): void {
    if (this.list.some((existing) => existing.id === provider.id)) {
      throw new Error(`Provider "${provider.id}" is already registered`);
    }
    this.list.push(provider);
    this.ensure(provider.id);
  }

  get(id: string): Provider | undefined {
    return this.list.find((provider) => provider.id === id);
  }

  /** All providers, in registration order. */
  providers(): Provider[] {
    return [...this.list];
  }

  /**
   * The failover chain: healthy providers first (registration order preserved),
   * known-unhealthy ones last. The first healthy provider wins.
   */
  chain(): Provider[] {
    return this.list
      .map((provider, index) => ({ provider, index, unhealthy: this.isUnhealthy(provider.id) }))
      .sort((a, b) => {
        if (a.unhealthy !== b.unhealthy) return a.unhealthy ? 1 : -1;
        return a.index - b.index;
      })
      .map((entry) => entry.provider);
  }

  // ── dispatch ──────────────────────────────────────────────────────────────

  /** Failover dispatch; returns only the result, exactly like a single provider. */
  async chat(req: ChatRequest): Promise<ChatResult> {
    const outcome = await this.chatWithProvider(req);
    return outcome.result;
  }

  /** Like {@link chat}, but also reports which provider answered (telemetry). */
  async chatWithProvider(req: ChatRequest): Promise<ChatOutcome> {
    if (this.autoHealthCheck) await this.refreshStaleHealth();
    const candidates = this.chain();
    if (candidates.length === 0) {
      throw new ProviderError("No providers registered", { provider: "registry", kind: "unknown" });
    }

    let lastError: unknown;
    for (let index = 0; index < candidates.length; index += 1) {
      const provider = candidates[index];
      if (!provider) continue;
      try {
        const result = await this.callWithRetries(provider, req);
        return { provider, result };
      } catch (error) {
        lastError = error;
        const next = candidates[index + 1];
        if (next) this.onSwitch?.(provider.id, next.id, error);
      }
    }

    const message = lastError instanceof Error ? lastError.message : String(lastError ?? "all providers failed");
    throw new ProviderError(`All providers failed: ${message}`, {
      provider: "registry",
      kind: classifyError(lastError),
      cause: lastError,
    });
  }

  private async callWithRetries(provider: Provider, req: ChatRequest): Promise<ChatResult> {
    let attempt = 0;
    for (;;) {
      const started = this.now();
      this.stat(provider.id).attempts += 1;
      try {
        const result = await provider.chat(req);
        this.recordSuccess(provider, result, Math.max(0, this.now() - started));
        return result;
      } catch (error) {
        this.recordFailure(provider, error, Math.max(0, this.now() - started));
        if (attempt >= this.maxRetries || !isRetryable(error)) {
          this.markUnhealthy(provider.id, error);
          throw error;
        }
        this.stat(provider.id).retries += 1;
        await this.sleep(this.computeDelay(attempt));
        attempt += 1;
      }
    }
  }

  private computeDelay(attempt: number): number {
    const base = Math.min(this.maxDelayMs, this.baseDelayMs * 2 ** attempt);
    if (this.jitter <= 0) return base;
    return Math.round(base * (1 + Math.random() * this.jitter));
  }

  // ── accounting ────────────────────────────────────────────────────────────

  private recordSuccess(provider: Provider, result: ChatResult, latencyMs: number): void {
    const metrics = this.stat(provider.id);
    metrics.successes += 1;
    metrics.totalLatencyMs += latencyMs;
    metrics.lastLatencyMs = latencyMs;
    metrics.avgLatencyMs = metrics.totalLatencyMs / metrics.successes;
    metrics.promptTokens += result.usage?.promptTokens ?? 0;
    metrics.completionTokens += result.usage?.completionTokens ?? 0;
    metrics.costUsd += this.costFor(provider, result);
    metrics.lastSuccessAt = this.now();
    metrics.unhealthyUntil = null;
  }

  private recordFailure(provider: Provider, error: unknown, _latencyMs: number): void {
    const metrics = this.stat(provider.id);
    metrics.failures += 1;
    metrics.lastError = error instanceof Error ? error.message : String(error ?? "unknown error");
  }

  private costFor(provider: Provider, result: ChatResult): number {
    const byId = this.costTable[provider.id];
    const model = this.modelOf(provider);
    const entry = byId ?? (model ? this.costTable[model] : undefined);
    if (!entry) return 0;
    const prompt = result.usage?.promptTokens ?? 0;
    const completion = result.usage?.completionTokens ?? 0;
    return (prompt / 1_000_000) * entry.inputPer1M + (completion / 1_000_000) * entry.outputPer1M;
  }

  metrics(id: string): ProviderMetrics {
    return { ...this.ensure(id) };
  }

  allMetrics(): ProviderMetrics[] {
    return this.list.map((provider) => this.metrics(provider.id));
  }

  resetMetrics(): void {
    for (const id of this.stats.keys()) this.stats.set(id, blankMetrics(id));
  }

  // ── health ────────────────────────────────────────────────────────────────

  /** Cached health for a provider (may be undefined before the first probe). */
  health(id: string): ProviderHealth | undefined {
    return this.healthCache.get(id)?.health;
  }

  /** Is the provider currently gated out of the front of the chain? */
  isUnhealthy(id: string): boolean {
    const metrics = this.ensure(id);
    if (metrics.unhealthyUntil != null && metrics.unhealthyUntil > this.now()) return true;
    const cached = this.healthCache.get(id);
    if (cached && !cached.health.ok && !this.isHealthStale(id)) return true;
    return false;
  }

  /** Run a fresh health probe for one provider (or all) and cache it. */
  async checkHealth(id?: string): Promise<ProviderHealth | undefined> {
    const targets = id ? this.list.filter((provider) => provider.id === id) : this.list;
    await Promise.all(targets.map((provider) => this.probe(provider)));
    return id ? this.health(id) : undefined;
  }

  private async probe(provider: Provider): Promise<void> {
    if (typeof provider.health !== "function") return;
    const checkedAt = this.now();
    let health: ProviderHealth;
    try {
      health = await this.withTimeout(provider.health(), RELIABILITY.healthTimeoutMs);
    } catch {
      health = { ok: false, provider: provider.id, checkedAt };
    }
    this.healthCache.set(provider.id, { health, at: this.now() });
    const metrics = this.stat(provider.id);
    if (health.ok) {
      // A good probe clears a soft (health-derived) cooldown.
      metrics.unhealthyUntil = null;
    } else {
      metrics.unhealthyUntil = this.now() + this.unhealthyCooldownMs;
    }
  }

  private async refreshStaleHealth(): Promise<void> {
    const stale = this.list.filter(
      (provider) => typeof provider.health === "function" && this.isHealthStale(provider.id),
    );
    if (stale.length === 0) return;
    await Promise.all(stale.map((provider) => this.probe(provider)));
  }

  private isHealthStale(id: string): boolean {
    const cached = this.healthCache.get(id);
    if (!cached) return true;
    return this.now() - cached.at >= this.healthCacheMs;
  }

  private markUnhealthy(id: string, error: unknown): void {
    const kind = classifyError(error);
    const cooldown =
      kind === "rate-limit" || kind === "auth" || kind === "model"
        ? this.exhaustedCooldownMs
        : this.unhealthyCooldownMs;
    this.stat(id).unhealthyUntil = this.now() + cooldown;
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new ProviderError("health check timed out", { provider: "registry", kind: "timeout" }));
      }, ms);
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private ensure(id: string): ProviderMetrics {
    let metrics = this.stats.get(id);
    if (!metrics) {
      metrics = blankMetrics(id);
      this.stats.set(id, metrics);
    }
    return metrics;
  }

  private stat(id: string): ProviderMetrics {
    return this.ensure(id);
  }
}

function blankMetrics(id: string): ProviderMetrics {
  return {
    providerId: id,
    attempts: 0,
    successes: 0,
    failures: 0,
    retries: 0,
    totalLatencyMs: 0,
    lastLatencyMs: null,
    avgLatencyMs: 0,
    promptTokens: 0,
    completionTokens: 0,
    costUsd: 0,
    lastError: null,
    lastSuccessAt: null,
    unhealthyUntil: null,
  };
}

/** Build a registry from explicit providers. */
export function createRegistry(options: FailoverRegistryOptions = {}): FailoverRegistry {
  return new FailoverRegistry(options);
}

export interface BrainRegistryConfig extends Omit<FailoverRegistryOptions, "providers"> {
  /** Provider ids to include, in failover order. Defaults to Groq → NVIDIA NIM. */
  chain?: string[];
  /** Per-provider config (api key, model, fetch). */
  providers?: Record<string, CatalogConfig>;
}

/**
 * Build the default Groq → NVIDIA NIM registry from the catalog. Providers
 * whose key is missing are left out of the chain (unless every one is keyless,
 * in which case all requested ids are kept so the failure is informative).
 */
export function createBrainRegistry(config: BrainRegistryConfig = {}): FailoverRegistry {
  const ids = config.chain ?? defaultFailoverChain();
  const overrides = config.providers ?? {};
  const built: Provider[] = [];
  const keyless: Provider[] = [];

  for (const id of ids) {
    const provider = createCatalogProvider(id, overrides[id] ?? {});
    const key = overrides[id]?.apiKey ?? envKeyFor(id);
    if (key) built.push(provider);
    else keyless.push(provider);
  }

  const providers = built.length > 0 ? built : keyless;
  return new FailoverRegistry({ ...config, providers });
}

function envKeyFor(id: string): string | undefined {
  const entry = getCatalogEntry(id);
  if (!entry) return undefined;
  return readEnv(entry.envKey);
}
