/**
 * Minimal OpenAI-compatible client implementing the `@diggy/shared` `Provider`
 * contract.
 *
 * Both Groq and NVIDIA NIM speak `POST {baseURL}/chat/completions`, so one
 * client serves both and swapping providers is only `baseURL` + `model` (+ key).
 * `fetch` is injectable, so every path is testable with no network.
 *
 * Supported: text + function/tool-calling + SSE streaming + speech-to-text
 * (Whisper-style). Not supported: images/vision input, structured-output mode,
 * embeddings. (Vision is planned; see {AgentMode}.)
 */
import type {
  ChatMessage,
  ChatRequest,
  ChatResult,
  ChatChunk,
  Provider,
  ProviderHealth,
  ToolCall,
  ToolSchema,
} from "@diggy/shared";
import { ProviderError } from "../errors.js";

export interface OpenAICompatibleConfig {
  /** Stable id, e.g. `groq` or `nvidia-nim`. */
  id: string;
  /** Human label for settings/telemetry. */
  label: string;
  /** Base URL including the version segment, e.g. `https://api.groq.com/openai/v1`. */
  baseURL: string;
  /** Bearer token; omit for local servers without auth. */
  apiKey?: string;
  /** Model id used for chat. */
  model: string;
  /** Extra headers merged onto every request. */
  headers?: Record<string, string>;
  /** Injectable fetch (tests); defaults to the global. */
  fetch?: typeof fetch;
  /** Whisper-style model id enabling `transcribe`. */
  sttModel?: string;
}

interface WireMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
  name?: string;
}

interface WireResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value ?? null) ?? "null";
  } catch {
    return String(value);
  }
}

/** Convert contract messages into the OpenAI wire format. */
export function toWireMessages(messages: ChatMessage[]): WireMessage[] {
  return messages.map((message) => {
    const wire: WireMessage = { role: message.role, content: message.content };
    if (message.role === "tool") {
      if (message.toolCallId) wire.tool_call_id = message.toolCallId;
      if (message.name) wire.name = message.name;
    }
    if (message.role === "assistant") {
      const calls = message.toolCalls;
      if (calls && calls.length > 0) {
        wire.tool_calls = calls.map((call) => ({
          id: call.id,
          type: "function" as const,
          function: { name: call.name, arguments: stringify(call.arguments) },
        }));
      }
    }
    return wire;
  });
}

function toWireTools(tools: ToolSchema[]): Array<{ type: "function"; function: ToolSchema }> {
  return tools.map((tool) => ({ type: "function" as const, function: tool }));
}

function parseFinishReason(reason: string | null | undefined, hasToolCalls: boolean): ChatResult["finishReason"] {
  if (hasToolCalls) return "tool_calls";
  if (reason === "length") return "length";
  if (reason === "content_filter") return "error";
  if (reason === "error") return "error";
  return "stop";
}

function parseToolCalls(raw: WireResponse["choices"]): ToolCall[] {
  const calls = raw?.[0]?.message?.tool_calls ?? [];
  return calls.map((call, index) => ({
    id: call.id ?? `call_${index}`,
    name: call.function?.name ?? "",
    arguments: parseArguments(call.function?.arguments),
  }));
}

function parseArguments(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "<unreadable body>";
  }
}

/** One ready-to-use OpenAI-compatible {@link Provider}. */
export class OpenAICompatibleProvider implements Provider {
  readonly id: string;
  readonly label: string;

  private readonly baseURL: string;
  private readonly apiKey: string | undefined;
  private readonly model: string;
  private readonly sttModel: string | undefined;
  private readonly extraHeaders: Record<string, string>;
  private readonly fetchImpl: typeof fetch;

  constructor(config: OpenAICompatibleConfig) {
    this.id = config.id;
    this.label = config.label;
    this.baseURL = config.baseURL.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.sttModel = config.sttModel;
    this.extraHeaders = config.headers ?? {};
    const fetchImpl = config.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== "function") {
      throw new Error("No fetch implementation available. Pass `fetch` in the provider config.");
    }
    // Bind to globalThis: an unbound native fetch called as a method throws
    // "Illegal invocation" in browsers.
    this.fetchImpl = fetchImpl.bind(globalThis);
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = { ...this.extraHeaders, ...extra };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
    return headers;
  }

  private async post(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
    return this.fetchImpl(`${this.baseURL}${path}`, {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
      signal,
    });
  }

  private buildBody(req: ChatRequest, stream: boolean): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: toWireMessages(req.messages),
      stream,
    };
    // gpt-oss models stream a long reasoning preamble that can swallow the
    // answer on some hosts; ask for minimal reasoning.
    if (/gpt-oss/i.test(this.model)) body.reasoning_effort = "low";
    if (req.temperature != null) body.temperature = req.temperature;
    if (req.maxTokens != null) body.max_tokens = req.maxTokens;
    if (req.tools && req.tools.length > 0) {
      body.tools = toWireTools(req.tools);
      body.tool_choice = "auto";
    }
    return body;
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    let response: Response;
    try {
      response = await this.post("/chat/completions", this.buildBody(req, false));
    } catch (error) {
      throw new ProviderError(`network failure: ${stringify(error)}`, {
        provider: this.id,
        kind: "network",
        cause: error,
      });
    }

    if (!response.ok) {
      const text = await safeText(response);
      throw new ProviderError(
        `${this.id} request failed (${response.status} ${response.statusText}): ${text}`,
        { provider: this.id, status: response.status },
      );
    }

    const json = (await response.json().catch(() => ({}))) as WireResponse;
    const toolCalls = parseToolCalls(json.choices);
    const text = json.choices?.[0]?.message?.content ?? "";
    return {
      text: typeof text === "string" ? text : "",
      toolCalls,
      finishReason: parseFinishReason(json.choices?.[0]?.finish_reason, toolCalls.length > 0),
      usage: {
        promptTokens: json.usage?.prompt_tokens ?? 0,
        completionTokens: json.usage?.completion_tokens ?? 0,
      },
    };
  }

  async *stream(req: ChatRequest): AsyncIterable<ChatChunk> {
    let response: Response;
    try {
      response = await this.post("/chat/completions", this.buildBody(req, true));
    } catch (error) {
      throw new ProviderError(`network failure: ${stringify(error)}`, {
        provider: this.id,
        kind: "network",
        cause: error,
      });
    }

    if (!response.ok || !response.body) {
      const text = response.body ? await safeText(response) : "empty response body";
      throw new ProviderError(
        `${this.id} stream failed (${response.status} ${response.statusText}): ${text}`,
        { provider: this.id, status: response.status },
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line.startsWith("data:")) continue;
          const payload = line.slice("data:".length).trim();
          if (payload.length === 0 || payload === "[DONE]") continue;
          let chunk: WireResponse & { choices?: Array<{ delta?: { content?: string } }> };
          try {
            chunk = JSON.parse(payload);
          } catch {
            continue;
          }
          const delta = chunk.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta.length > 0) yield { delta };
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async transcribe(audio: ArrayBuffer, opts?: { language?: string }): Promise<string> {
    if (!this.sttModel) {
      throw new ProviderError(`${this.id} does not support transcription`, {
        provider: this.id,
        kind: "model",
      });
    }
    const form = new FormData();
    form.append("model", this.sttModel);
    form.append("file", new Blob([audio]), "audio.webm");
    if (opts?.language) form.append("language", opts.language);

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseURL}/audio/transcriptions`, {
        method: "POST",
        headers: this.headers(),
        body: form,
      });
    } catch (error) {
      throw new ProviderError(`network failure: ${stringify(error)}`, {
        provider: this.id,
        kind: "network",
        cause: error,
      });
    }

    if (!response.ok) {
      const text = await safeText(response);
      throw new ProviderError(
        `${this.id} transcription failed (${response.status} ${response.statusText}): ${text}`,
        { provider: this.id, status: response.status },
      );
    }
    const json = (await response.json().catch(() => ({}))) as { text?: string };
    return json.text ?? "";
  }

  async health(): Promise<ProviderHealth> {
    const checkedAt = Date.now();
    const started = Date.now();
    try {
      const response = await this.fetchImpl(`${this.baseURL}/models`, {
        method: "GET",
        headers: this.headers(),
      });
      return { ok: response.ok, provider: this.id, latencyMs: Date.now() - started, checkedAt };
    } catch {
      return {
        ok: false,
        provider: this.id,
        latencyMs: Date.now() - started,
        checkedAt,
      };
    }
  }
}

/** Create a ready-to-use OpenAI-compatible provider. */
export function createOpenAICompatibleProvider(config: OpenAICompatibleConfig): Provider {
  return new OpenAICompatibleProvider(config);
}
