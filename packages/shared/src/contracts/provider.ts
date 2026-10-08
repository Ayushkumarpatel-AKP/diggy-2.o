/**
 * Provider contract — provider-agnostic LLM/STT/TTS layer.
 * One implementation per provider (Groq primary, NVIDIA NIM failover, future OpenAI/Anthropic/Gemini).
 * Owning worker: brain (`packages/core`).
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  name?: string;
  /** Tool calls emitted by an assistant turn; echoed back on the next request. */
  toolCalls?: ToolCall[];
}

export interface ToolSchema {
  name: string;
  description: string;
  /** JSON Schema for the arguments object. */
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatRequest {
  messages: ChatMessage[];
  tools?: ToolSchema[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface ChatChunk {
  delta: string;
}

export interface ChatResult {
  text: string;
  toolCalls: ToolCall[];
  finishReason: "stop" | "length" | "tool_calls" | "error";
  usage?: { promptTokens?: number; completionTokens?: number };
}

export interface ProviderHealth {
  ok: boolean;
  provider: string;
  latencyMs?: number;
  checkedAt: number;
}

export interface Provider {
  id: string;
  label: string;
  chat(req: ChatRequest): Promise<ChatResult>;
  stream?(req: ChatRequest): AsyncIterable<ChatChunk>;
  transcribe?(audio: ArrayBuffer, opts?: { language?: string }): Promise<string>;
  speak?(text: string, opts?: { voice?: string }): Promise<{ audio: ArrayBuffer; mimeType: string }>;
  health?(): Promise<ProviderHealth>;
}

export interface ProviderRegistry {
  register(provider: Provider): void;
  get(id: string): Provider | undefined;
  /** Ordered failover chain; first healthy provider wins. */
  chain(): Provider[];
}
