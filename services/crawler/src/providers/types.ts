/**
 * Shared, provider-agnostic types for the pluggable crawl/extract adapters.
 *
 * Every provider (the built-in Crawlee+Playwright crawler, `reach`, Firecrawl,
 * Crawl4AI, browser-use, the Python sidecar) implements {@link CrawlProvider}
 * and speaks the same result shapes so the HTTP surface in `server.ts` can swap
 * them transparently.
 */

/** A single crawled page in the canonical shape returned by every provider. */
export interface ProviderPage {
  url: string;
  title: string;
  markdown: string;
}

/** A single extracted page in the canonical shape returned by every provider. */
export interface ProviderExtract {
  title: string;
  markdown: string;
}

/** Input accepted by {@link CrawlProvider.crawl}. */
export interface CrawlInput {
  url: string;
  depth?: number;
  maxPages?: number;
  timeoutMs?: number;
}

/**
 * The adapter contract. `available()` reports whether the provider is usable
 * with the current settings/env; `crawl()` is required while `extract()` is an
 * optional capability that falls back to the built-in extractor when absent.
 */
export interface CrawlProvider {
  name: string;
  available(): boolean;
  crawl(input: CrawlInput): Promise<ProviderPage[]>;
  extract?(url: string): Promise<ProviderExtract>;
}

/** Minimal `fetch` signature so adapters can be unit-tested with a stub. */
export type FetchLike = typeof fetch;

/** Environment-driven configuration shared by every provider adapter. */
export interface ProviderSettings {
  firecrawlApiKey?: string;
  firecrawlApiBase?: string;
  crawl4aiUrl?: string;
  browserUseUrl?: string;
  pythonSidecarUrl?: string;
}

/** Default Firecrawl API origin when `FIRECRAWL_API_BASE` is not set. */
export const DEFAULT_FIRECRAWL_API_BASE = "https://api.firecrawl.dev";

/** Default self-hosted Crawl4AI origin, only used when `CRAWL4AI_URL` is unset. */
export const DEFAULT_CRAWL4AI_URL = "http://localhost:11235";

/** Default optional Python extractor sidecar origin. */
export const DEFAULT_PYTHON_SIDECAR_URL = "http://127.0.0.1:17323";

/** Names of the network providers, in preference order for the fallback chain. */
export const PROVIDER_NAMES = ["firecrawl", "crawl4ai", "browser-use", "python-sidecar"] as const;

/** Union of every provider identifier the service knows about. */
export type ProviderName = (typeof PROVIDER_NAMES)[number] | "builtin" | "reach";

function envValue(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const raw = env[key];
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : undefined;
}

/** Read provider settings from an environment map (defaults to `process.env`). */
export function readSettings(env: NodeJS.ProcessEnv = process.env): ProviderSettings {
  return {
    firecrawlApiKey: envValue(env, "FIRECRAWL_API_KEY"),
    firecrawlApiBase: envValue(env, "FIRECRAWL_API_BASE"),
    crawl4aiUrl: envValue(env, "CRAWL4AI_URL"),
    browserUseUrl: envValue(env, "BROWSER_USE_URL"),
    pythonSidecarUrl: envValue(env, "PYTHON_EXTRACTOR_URL"),
  };
}
