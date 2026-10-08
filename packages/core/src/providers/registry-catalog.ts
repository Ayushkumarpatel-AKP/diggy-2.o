/**
 * Model-agnostic provider catalog.
 *
 * One descriptor per vendor so adding a new brain (OpenAI, Anthropic, Gemini,
 * OpenRouter, …) is a single file — the registry, settings UI and failover
 * chain all read from here and never hard-code a vendor.
 *
 * `dialect` marks the wire protocol: `openai-compatible` vendors reuse the
 * shared HTTP client; `anthropic`/`gemini` get their own client in their own
 * file when they land (currently `planned`, so `create()` fails loudly instead
 * of pretending).
 */
import type { Provider } from "@diggy/shared";
import { readEnv } from "../env.js";
import { ProviderError } from "../errors.js";
import { createOpenAICompatibleProvider } from "./http.js";
import { createGroqProvider, GROQ_BASE_URL, GROQ_DEFAULT_MODEL, GROQ_PROVIDER_ID, GROQ_STT_MODEL } from "./groq.js";
import {
  createNvidiaNimProvider,
  NVIDIA_NIM_BASE_URL,
  NVIDIA_NIM_DEFAULT_MODEL,
  NVIDIA_NIM_PROVIDER_ID,
} from "./nvidia-nim.js";

export type ProviderDialect = "openai-compatible" | "anthropic" | "gemini";

export interface CatalogConfig {
  apiKey?: string;
  model?: string;
  baseURL?: string;
  /** Speech-to-text model, when the vendor supports one. */
  sttModel?: string;
  headers?: Record<string, string>;
  /** Injectable fetch (tests). */
  fetch?: typeof fetch;
}

export interface ProviderCatalogEntry {
  id: string;
  label: string;
  dialect: ProviderDialect;
  baseURL: string;
  defaultModel: string;
  /** Environment variable the key is read from (server-side only). */
  envKey: string;
  /** Whisper-style STT model, when the vendor offers one. */
  sttModel?: string;
  /** Lower number = preferred earlier in the failover chain. */
  priority: number;
  status: "available" | "planned";
  /** Build the provider. Available entries return a `Provider`. */
  create(config?: CatalogConfig): Provider;
}

/** An OpenAI-compatible entry whose client is the shared HTTP client. */
function openAICompatibleEntry(
  entry: Omit<ProviderCatalogEntry, "dialect" | "status" | "create"> & {
    sttModel?: string;
  },
): ProviderCatalogEntry {
  return {
    ...entry,
    dialect: "openai-compatible",
    status: "available",
    create(config: CatalogConfig = {}): Provider {
      return createOpenAICompatibleProvider({
        id: entry.id,
        label: entry.label,
        baseURL: config.baseURL ?? entry.baseURL,
        apiKey: config.apiKey ?? readEnv(entry.envKey),
        model: config.model ?? entry.defaultModel,
        sttModel: entry.sttModel,
        headers: config.headers,
        fetch: config.fetch,
      });
    },
  };
}

/** A vendor whose client has not been written yet — fails loudly, never fakes. */
function plannedEntry(
  entry: Omit<ProviderCatalogEntry, "status" | "create">,
): ProviderCatalogEntry {
  return {
    ...entry,
    status: "planned",
    create(): Provider {
      throw new ProviderError(`${entry.label} provider is not implemented yet`, {
        provider: entry.id,
        kind: "model",
      });
    },
  };
}

const GROQ_ENTRY: ProviderCatalogEntry = {
  id: GROQ_PROVIDER_ID,
  label: "Groq",
  dialect: "openai-compatible",
  baseURL: GROQ_BASE_URL,
  defaultModel: GROQ_DEFAULT_MODEL,
  envKey: "GROQ_API_KEY",
  sttModel: GROQ_STT_MODEL,
  priority: 0,
  status: "available",
  create: (config = {}) =>
    createGroqProvider({
      apiKey: config.apiKey,
      model: config.model,
      baseURL: config.baseURL,
      sttModel: config.sttModel,
      headers: config.headers,
      fetch: config.fetch,
    }),
};

const NVIDIA_ENTRY: ProviderCatalogEntry = {
  id: NVIDIA_NIM_PROVIDER_ID,
  label: "NVIDIA NIM",
  dialect: "openai-compatible",
  baseURL: NVIDIA_NIM_BASE_URL,
  defaultModel: NVIDIA_NIM_DEFAULT_MODEL,
  envKey: "NVIDIA_API_KEY",
  priority: 1,
  status: "available",
  create: (config = {}) =>
    createNvidiaNimProvider({
      apiKey: config.apiKey,
      model: config.model,
      baseURL: config.baseURL,
      headers: config.headers,
      fetch: config.fetch,
    }),
};

const OPENAI_ENTRY = openAICompatibleEntry({
  id: "openai",
  label: "OpenAI",
  baseURL: "https://api.openai.com/v1",
  defaultModel: "gpt-4o-mini",
  envKey: "OPENAI_API_KEY",
  priority: 10,
});

const OPENROUTER_ENTRY = openAICompatibleEntry({
  id: "openrouter",
  label: "OpenRouter",
  baseURL: "https://openrouter.ai/api/v1",
  defaultModel: "openai/gpt-oss-120b",
  envKey: "OPENROUTER_API_KEY",
  priority: 20,
});

const ANTHROPIC_ENTRY = plannedEntry({
  id: "anthropic",
  label: "Anthropic",
  dialect: "anthropic",
  baseURL: "https://api.anthropic.com/v1",
  defaultModel: "claude-3-5-sonnet-latest",
  envKey: "ANTHROPIC_API_KEY",
  priority: 30,
});

const GEMINI_ENTRY = plannedEntry({
  id: "gemini",
  label: "Gemini",
  dialect: "gemini",
  baseURL: "https://generativelanguage.googleapis.com/v1beta",
  defaultModel: "gemini-1.5-flash",
  envKey: "GEMINI_API_KEY",
  priority: 31,
});

/** Every provider the brain knows about, available first, by priority. */
export const PROVIDER_CATALOG: readonly ProviderCatalogEntry[] = Object.freeze([
  GROQ_ENTRY,
  NVIDIA_ENTRY,
  OPENAI_ENTRY,
  OPENROUTER_ENTRY,
  ANTHROPIC_ENTRY,
  GEMINI_ENTRY,
]);

/** Look up one entry by id. */
export function getCatalogEntry(id: string): ProviderCatalogEntry | undefined {
  return PROVIDER_CATALOG.find((entry) => entry.id === id);
}

/** Available (implemented) entries, preferred first. */
export function listCatalog(): ProviderCatalogEntry[] {
  return PROVIDER_CATALOG.filter((entry) => entry.status === "available").sort((a, b) => a.priority - b.priority);
}

/** Ids of the default Groq → NVIDIA NIM failover chain. */
export function defaultFailoverChain(): string[] {
  return [GROQ_ENTRY.id, NVIDIA_ENTRY.id];
}

/** Build a provider from the catalog by id. */
export function createCatalogProvider(id: string, config: CatalogConfig = {}): Provider {
  const entry = getCatalogEntry(id);
  if (!entry) {
    throw new ProviderError(`Unknown provider "${id}"`, { provider: id, kind: "model" });
  }
  return entry.create(config);
}
