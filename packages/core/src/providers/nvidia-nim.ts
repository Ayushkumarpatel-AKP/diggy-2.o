/**
 * NVIDIA NIM provider — the failover brain, OpenAI-compatible.
 *
 * Chat: `openai/gpt-oss-20b`. NVIDIA NIM exposes the same
 * `POST /chat/completions` surface as Groq, so the registry treats them as
 * interchangeable and the user never sees the switch.
 */
import type { Provider } from "@diggy/shared";
import { readEnv } from "../env.js";
import { createOpenAICompatibleProvider } from "./http.js";

export const NVIDIA_NIM_BASE_URL = "https://integrate.api.nvidia.com/v1";
export const NVIDIA_NIM_DEFAULT_MODEL = "openai/gpt-oss-20b";
export const NVIDIA_NIM_PROVIDER_ID = "nvidia-nim";

export interface NvidiaNimConfig {
  /** API key; falls back to `process.env.NVIDIA_API_KEY`. */
  apiKey?: string;
  baseURL?: string;
  model?: string;
  headers?: Record<string, string>;
  /** Injectable fetch (tests). */
  fetch?: typeof fetch;
}

function resolveApiKey(explicit?: string): string | undefined {
  if (explicit) return explicit;
  return readEnv("NVIDIA_API_KEY");
}

/** Create the NVIDIA NIM {@link Provider}. */
export function createNvidiaNimProvider(config: NvidiaNimConfig = {}): Provider {
  return createOpenAICompatibleProvider({
    id: NVIDIA_NIM_PROVIDER_ID,
    label: "NVIDIA NIM",
    baseURL: config.baseURL ?? NVIDIA_NIM_BASE_URL,
    apiKey: resolveApiKey(config.apiKey),
    model: config.model ?? NVIDIA_NIM_DEFAULT_MODEL,
    headers: config.headers,
    fetch: config.fetch,
  });
}
