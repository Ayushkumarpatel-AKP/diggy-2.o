import { BUILTIN_PROVIDER_NAME, createBuiltinProvider } from "./builtin.js";
import { BROWSER_USE_PROVIDER_NAME, createBrowserUseProvider } from "./experimental/browser-use.js";
import { CRAWL4AI_PROVIDER_NAME, createCrawl4aiProvider } from "./experimental/crawl4ai.js";
import { FIRECRAWL_PROVIDER_NAME, createFirecrawlProvider } from "./experimental/firecrawl.js";
import {
  PYTHON_SIDECAR_PROVIDER_NAME,
  createPythonSidecarProvider,
} from "./experimental/python-sidecar.js";
import { REACH_PROVIDER_NAME, createReachProvider } from "./reach.js";
import { readSettings, type CrawlProvider, type ProviderSettings } from "./types.js";

/** Summary row returned by {@link listProviders}. */
export interface ProviderSummary {
  name: string;
  /** Whether the provider is usable **as a registered backend** right now. */
  available: boolean;
  /** Set on opt-in adapters (always reported `available: false` by default). */
  experimental?: boolean;
}

/** Stable identifiers of the opt-in adapters. */
export const EXPERIMENTAL_PROVIDER_IDS = [
  "firecrawl",
  "crawl4ai",
  "browser-use",
  "python-sidecar",
] as const;

/** One of the {@link EXPERIMENTAL_PROVIDER_IDS}. */
export type ExperimentalProviderId = (typeof EXPERIMENTAL_PROVIDER_IDS)[number];

/** The always-available default surface: built-in Crawlee+Playwright + reach. */
function buildDefaultProviders(): CrawlProvider[] {
  return [createBuiltinProvider(), createReachProvider()];
}

/** Instantiate the opt-in adapters (never part of the default set). */
function buildExperimentalProviders(settings: ProviderSettings): CrawlProvider[] {
  return [
    createFirecrawlProvider(settings),
    createCrawl4aiProvider(settings),
    createBrowserUseProvider(settings),
    createPythonSidecarProvider(settings),
  ];
}

/** Opt in to the vendor/sidecar adapters. `false` returns the default set. */
export async function experimentalProviders(enabled: boolean): Promise<CrawlProvider[]> {
  const defaults = buildDefaultProviders();
  if (!enabled) return defaults;
  return [...buildExperimentalProviders(readSettings()), ...defaults];
}

/** List the providers reported by `/providers` and `/health`. */
export function listProviders(settings: ProviderSettings = readSettings()): ProviderSummary[] {
  const experimental: ProviderSummary[] = buildExperimentalProviders(settings).map((provider) => ({
    name: provider.name,
    available: false,
    experimental: true,
  }));

  const defaults: ProviderSummary[] = buildDefaultProviders()
    .filter((provider) => provider.name !== REACH_PROVIDER_NAME)
    .map((provider) => ({ name: provider.name, available: provider.available() }));

  return [...experimental, ...defaults];
}

/** Every registered default provider — including the `reach` layer. */
export function listAllProviders(settings: ProviderSettings = readSettings()): ProviderSummary[] {
  return buildDefaultProviders().map((provider) => ({
    name: provider.name,
    available: provider.available(),
  }));
}

/**
 * Resolve the provider to use for a request. Only the default surface is
 * considered; the opt-in adapters can never be selected here.
 */
export function resolveProvider(
  preferred?: string,
  settings: ProviderSettings = readSettings(),
): CrawlProvider {
  const providers = buildDefaultProviders();
  const builtin = providers.find((provider) => provider.name === BUILTIN_PROVIDER_NAME);
  if (!builtin) {
    return createBuiltinProvider();
  }

  const wanted = preferred?.trim().toLowerCase();
  if (wanted) {
    const match = providers.find((provider) => provider.name === wanted);
    if (match && match.available()) return match;
  }

  for (const provider of providers) {
    if (provider.available()) return provider;
  }

  return builtin;
}

export { BUILTIN_PROVIDER_NAME, createBuiltinProvider } from "./builtin.js";
export {
  BROWSER_USE_PROVIDER_NAME,
  createBrowserUseProvider,
  parseBrowserUseResult,
} from "./experimental/index.js";
export type { BrowserUseOptions } from "./experimental/index.js";
export {
  CRAWL4AI_PROVIDER_NAME,
  createCrawl4aiProvider,
  mapCrawl4aiItem,
} from "./experimental/index.js";
export type { Crawl4aiOptions } from "./experimental/index.js";
export {
  FIRECRAWL_PROVIDER_NAME,
  createFirecrawlProvider,
  mapFirecrawlDocument,
} from "./experimental/index.js";
export type { FirecrawlOptions } from "./experimental/index.js";
export {
  PYTHON_SIDECAR_PROVIDER_NAME,
  createPythonSidecarProvider,
  mapSidecarResponse,
} from "./experimental/index.js";
export type { PythonSidecarOptions } from "./experimental/index.js";
export {
  DEFAULT_CRAWL4AI_URL,
  DEFAULT_FIRECRAWL_API_BASE,
  DEFAULT_PYTHON_SIDECAR_URL,
  PROVIDER_NAMES,
  readSettings,
} from "./types.js";
export {
  DOCTOR_TIMEOUT_MS,
  FEED_TIMEOUT_MS,
  JINA_READER_BASE,
  PROBE_TTL_MS,
  REACH_PROVIDER_NAME,
  TRANSCRIPT_TIMEOUT_MS,
  createReachProvider,
  fetchFeed,
  fetchTranscript,
  parseDoctorOutput,
  parseFeed,
  probeReach,
  reachChannelKey,
  reachProviderSummary,
  readWithReach,
  resetReachProbeCache,
  stripVtt,
} from "./reach.js";
export type {
  FeedItem,
  FeedResult,
  ReachProbeResult,
  ReadResult,
  TranscriptResult,
} from "./reach.js";
export type {
  CrawlInput,
  CrawlProvider,
  FetchLike,
  ProviderExtract,
  ProviderName,
  ProviderPage,
  ProviderSettings,
} from "./types.js";
