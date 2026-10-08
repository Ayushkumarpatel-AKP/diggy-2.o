import { describe, expect, it } from "vitest";

import type { ChatMessage } from "@diggy/shared";

import { ProviderError } from "../errors.js";
import { toWireMessages } from "./http.js";
import { createGroqProvider } from "./groq.js";

interface Captured {
  url: string;
  init: RequestInit | undefined;
}

function fakeFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): {
  fn: typeof fetch;
  calls: Captured[];
} {
  const calls: Captured[] = [];
  const fn = (async (input: unknown, init?: RequestInit) => {
    const url = typeof input === "string" ? input : String(input);
    calls.push({ url, init });
    return handler(url, init);
  }) as unknown as typeof fetch;
  return { fn, calls };
}

function bodyOf(call: Captured | undefined): Record<string, unknown> {
  return JSON.parse(String(call?.init?.body)) as Record<string, unknown>;
}

function headersOf(call: Captured | undefined): Record<string, string> {
  return (call?.init?.headers ?? {}) as Record<string, string>;
}

describe("OpenAI-compatible provider", () => {
  it("parses text, tool calls, usage and finish reason", async () => {
    const { fn, calls } = fakeFetch(
      () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "hi there",
                  tool_calls: [{ id: "c1", function: { name: "readPage", arguments: '{"url":"x"}' } }],
                },
                finish_reason: "tool_calls",
              },
            ],
            usage: { prompt_tokens: 12, completion_tokens: 7 },
          }),
          { status: 200 },
        ),
    );
    const provider = createGroqProvider({ apiKey: "k", fetch: fn });

    const result = await provider.chat({ messages: [{ role: "user", content: "hi" }] });

    expect(result.text).toBe("hi there");
    expect(result.toolCalls).toEqual([{ id: "c1", name: "readPage", arguments: { url: "x" } }]);
    expect(result.finishReason).toBe("tool_calls");
    expect(result.usage).toEqual({ promptTokens: 12, completionTokens: 7 });

    const body = bodyOf(calls[0]);
    expect(body.model).toBe("openai/gpt-oss-120b");
    expect(body.reasoning_effort).toBe("low");
    expect(headersOf(calls[0]).Authorization).toBe("Bearer k");
    expect(calls[0]?.url).toBe("https://api.groq.com/openai/v1/chat/completions");
  });

  it("maps tool schemas onto the wire format", async () => {
    const { fn, calls } = fakeFetch(
      () => new Response(JSON.stringify({ choices: [{ message: { content: "ok" }, finish_reason: "stop" }] }), { status: 200 }),
    );
    const provider = createGroqProvider({ apiKey: "k", fetch: fn });

    await provider.chat({
      messages: [{ role: "user", content: "hi" }],
      tools: [{ name: "readPage", description: "read", parameters: { type: "object" } }],
    });

    const body = bodyOf(calls[0]);
    expect(body.tool_choice).toBe("auto");
    expect(body.tools).toEqual([
      { type: "function", function: { name: "readPage", description: "read", parameters: { type: "object" } } },
    ]);
  });

  it("throws a classified ProviderError on a non-ok response", async () => {
    const { fn } = fakeFetch(() => new Response("nope", { status: 401, statusText: "Unauthorized" }));
    const provider = createGroqProvider({ apiKey: "bad", fetch: fn });

    await expect(provider.chat({ messages: [] })).rejects.toBeInstanceOf(ProviderError);
    try {
      await provider.chat({ messages: [] });
    } catch (error) {
      expect((error as ProviderError).status).toBe(401);
      expect((error as ProviderError).kind).toBe("auth");
      expect((error as ProviderError).provider).toBe("groq");
    }
  });

  it("transcribes audio via the multipart endpoint", async () => {
    const { fn, calls } = fakeFetch(() => new Response(JSON.stringify({ text: "hello world" }), { status: 200 }));
    const provider = createGroqProvider({ apiKey: "k", fetch: fn });

    const text = await provider.transcribe?.(new ArrayBuffer(8), { language: "en" });

    expect(text).toBe("hello world");
    expect(calls[0]?.url).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
    expect(calls[0]?.init?.body).toBeInstanceOf(FormData);
  });

  it("streams SSE deltas", async () => {
    const sse =
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n' +
      ": keep-alive\n\n" +
      'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n' +
      "data: [DONE]\n\n";
    const { fn } = fakeFetch(() => new Response(sse, { status: 200 }));
    const provider = createGroqProvider({ apiKey: "k", fetch: fn });

    const pieces: string[] = [];
    for await (const chunk of provider.stream?.({ messages: [] }) ?? []) pieces.push(chunk.delta);

    expect(pieces.join("")).toBe("Hello");
  });

  it("reports health from GET /models", async () => {
    const { fn, calls } = fakeFetch(() => new Response("{}", { status: 200 }));
    const provider = createGroqProvider({ apiKey: "k", fetch: fn });

    const health = await provider.health?.();

    expect(health?.ok).toBe(true);
    expect(calls[0]?.url).toBe("https://api.groq.com/openai/v1/models");
  });
});

describe("toWireMessages", () => {
  it("emits assistant tool_calls so a tool loop can continue", () => {
    const message: ChatMessage = {
      role: "assistant",
      content: "",
      toolCalls: [{ id: "c1", name: "readPage", arguments: { url: "x" } }],
    };
    const wire = toWireMessages([message]);
    expect(wire[0]?.tool_calls).toEqual([
      { id: "c1", type: "function", function: { name: "readPage", arguments: '{"url":"x"}' } },
    ]);
  });

  it("carries tool_call_id on tool results", () => {
    const wire = toWireMessages([{ role: "tool", content: "result", toolCallId: "c1", name: "readPage" }]);
    expect(wire[0]).toMatchObject({ role: "tool", content: "result", tool_call_id: "c1", name: "readPage" });
  });
});
