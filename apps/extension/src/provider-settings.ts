/**
 * Provider settings — lets the user point DIGGY at ANY OpenAI-compatible source.
 *
 * Stored in `chrome.storage.local` (never bundled, never sent anywhere except the
 * provider the user chose). The background builds a `Provider` from this at call
 * time, so changing the key/source takes effect immediately.
 */

export interface ProviderSettings {
  /** Which preset the values came from (drives the UI + defaults). */
  presetId: string;
  apiKey: string;
  /** Base URL including the version segment, e.g. `https://api.groq.com/openai/v1`. */
  baseUrl: string;
  /** Chat model id. */
  model: string;
  /** Optional speech-to-text model id (Whisper-style). */
  sttModel: string;
  /** BCP-47 tag for dictation + speech synthesis. */
  lang: string;
}

export interface ProviderPreset {
  id: string;
  label: string;
  baseUrl: string;
  model: string;
  sttModel: string;
  /** `false` for local servers that need no API key. */
  needsKey: boolean;
  /** Where to get a key (plain hint, never a clickable guess). */
  hint?: string;
}

/** Presets for the common sources; the last entry accepts anything compatible. */
export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  {
    id: "groq",
    label: "Groq — fast, free tier",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "openai/gpt-oss-120b",
    sttModel: "whisper-large-v3",
    needsKey: true,
    hint: "console.groq.com/keys",
  },
  {
    id: "nvidia",
    label: "NVIDIA NIM",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    model: "openai/gpt-oss-20b",
    sttModel: "",
    needsKey: true,
    hint: "build.nvidia.com",
  },
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    sttModel: "whisper-1",
    needsKey: true,
    hint: "platform.openai.com/api-keys",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openai/gpt-4o-mini",
    sttModel: "",
    needsKey: true,
    hint: "openrouter.ai/keys",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    sttModel: "",
    needsKey: true,
  },
  {
    id: "together",
    label: "Together AI",
    baseUrl: "https://api.together.xyz/v1",
    model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    sttModel: "",
    needsKey: true,
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    baseUrl: "http://localhost:11434/v1",
    model: "llama3.2",
    sttModel: "",
    needsKey: false,
    hint: "run `ollama serve`",
  },
  {
    id: "lmstudio",
    label: "LM Studio (local)",
    baseUrl: "http://localhost:1234/v1",
    model: "local-model",
    sttModel: "",
    needsKey: false,
    hint: "start the local server",
  },
  {
    id: "custom",
    label: "Custom — any OpenAI-compatible endpoint",
    baseUrl: "https://",
    model: "",
    sttModel: "",
    needsKey: true,
  },
];

export const SETTINGS_KEY = "diggy:providers";

export function presetById(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((preset) => preset.id === id);
}

/** Build a preset's defaults into a full settings object. */
export function settingsFromPreset(id: string): ProviderSettings {
  const preset = presetById(id) ?? PROVIDER_PRESETS[0]!;
  return {
    presetId: preset.id,
    apiKey: "",
    baseUrl: preset.baseUrl,
    model: preset.model,
    sttModel: preset.sttModel,
    lang: "en-IN",
  };
}

export const DEFAULT_SETTINGS: ProviderSettings = settingsFromPreset("groq");

/** Normalise whatever is in storage into complete settings (tolerates old shapes). */
export function normalizeSettings(raw: unknown): ProviderSettings {
  const value = (raw ?? {}) as Partial<ProviderSettings> & { groq?: string };
  if (!value.presetId && typeof value.groq === "string" && value.groq) {
    // The first cut stored `{ groq: "gsk_…" }`.
    return { ...DEFAULT_SETTINGS, apiKey: value.groq };
  }
  const preset = presetById(value.presetId ?? "") ?? PROVIDER_PRESETS[0]!;
  return {
    presetId: preset.id,
    apiKey: value.apiKey ?? "",
    baseUrl: value.baseUrl || preset.baseUrl,
    model: value.model || preset.model,
    sttModel: value.sttModel ?? preset.sttModel,
    lang: value.lang || DEFAULT_SETTINGS.lang,
  };
}

/** Is the configuration usable? Local presets need no key. */
export function settingsReady(settings: ProviderSettings): boolean {
  if (!settings.baseUrl || !settings.model) return false;
  if (settings.apiKey.trim()) return true;
  return presetById(settings.presetId)?.needsKey === false;
}

/** The origin pattern to request permission for before we may `fetch` it. */
export function originPattern(baseUrl: string): string | null {
  try {
    const url = new URL(baseUrl);
    return `${url.protocol}//${url.host}/*`;
  } catch {
    return null;
  }
}
