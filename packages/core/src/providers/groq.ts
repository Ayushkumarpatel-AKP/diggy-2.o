/**
 * Groq provider — the primary brain, OpenAI-compatible.
 *
 * Chat: `openai/gpt-oss-120b` (strong, tool-calling). STT: `whisper-large-v3`.
 * Only `baseURL` + `model` (+ key) differ from NVIDIA NIM, so the registry can
 * fail one over to the other with no caller changes.
 */
import type { Provider } from "@diggy/shared";
import { readEnv } from "../env.js";
import { createOpenAICompatibleProvider } from "./http.js";

export const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
export const GROQ_DEFAULT_MODEL = "openai/gpt-oss-120b";
export const GROQ_STT_MODEL = "whisper-large-v3";
export const GROQ_PROVIDER_ID = "groq";

export interface GroqConfig {
  /** API key; falls back to `process.env.GROQ_API_KEY`. */
  apiKey?: string;
  baseURL?: string;
  model?: string;
  sttModel?: string;
  headers?: Record<string, string>;
  /** Injectable fetch (tests). */
  fetch?: typeof fetch;
}

function resolveApiKey(explicit?: string): string | undefined {
  if (explicit) return explicit;
  return readEnv("GROQ_API_KEY");
}

/** Create the Groq {@link Provider}. */
export function createGroqProvider(config: GroqConfig = {}): Provider {
  return createOpenAICompatibleProvider({
    id: GROQ_PROVIDER_ID,
    label: "Groq",
    baseURL: config.baseURL ?? GROQ_BASE_URL,
    apiKey: resolveApiKey(config.apiKey),
    model: config.model ?? GROQ_DEFAULT_MODEL,
    sttModel: config.sttModel ?? GROQ_STT_MODEL,
    headers: config.headers,
    fetch: config.fetch,
  });
}
