import { describe, expect, it, vi } from "vitest";

import type { ChatRequest, ChatResult, Provider, ProviderHealth } from "@diggy/shared";
import { ProviderError } from "./errors.js";
import { createRegistry } from "./registry.js";

interface FakeOptions {
  /** Throw on the first N calls, then succeed. */
  failTimes?: number;
  error?: unknown;
  result?: Partial<ChatResult>;
  health?: ProviderHealth;
}

function fakeProvider(id: string, options: FakeOptions = {}): { provider: Provider; calls: () => number } {
  let calls = 0;
  const provider: Provider = {
    id,
    label: id,
    async chat(): Promise<ChatResult> {
      calls += 1;
      if (options.failTimes != null && calls <= options.failTimes) {
        throw options.error ?? new Error("boom 502 bad gateway");
      }
      return {
        text: "ok",
        toolCalls: [],
        finishReason: "stop",
        usage: { promptTokens: 100, completionTokens: 50 },
        ...options.result,
      };
    },
  };
  if (options.health) {
    provider.health = async () => options.health as ProviderHealth;
  }
  return { provider, calls: () => calls };
}

const request: ChatRequest = { messages: [{ role: "user", content: "hi" }] };
const noSleep = async () => {};

describe("FailoverRegistry — chain ordering", () => {
  it("keeps registration order while every provider is healthy", () => {
    const a = fakeProvider("a");
    const b = fakeProvider("b");
    const c = fakeProvider("c");
    const registry = createRegistry({ providers: [a.provider, b.provider, c.provider] });
    expect(registry.chain().map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("sorts a known-unhealthy provider to the back of the chain", async () => {
    const sick = fakeProvider("sick", {
      health: { ok: false, provider: "sick", checkedAt: 0 },
    });
    const well = fakeProvider("well", {
      health: { ok: true, provider: "well", checkedAt: 0 },
    });
    const registry = createRegistry({ providers: [sick.provider, well.provider] });

    await registry.checkHealth();

    expect(registry.chain().map((p) => p.id)).toEqual(["well", "sick"]);
  });
});

describe("FailoverRegistry — failover", () => {
  it("fails over from Groq to NVIDIA when Groq is down", async () => {
    const groq = fakeProvider("groq", { failTimes: 99, error: new Error("502 bad gateway") });
    const nvidia = fakeProvider("nvidia-nim");
    const onSwitch = vi.fn();
    const registry = createRegistry({
      providers: [groq.provider, nvidia.provider],
      sleep: noSleep,
      onSwitch,
    });

    const outcome = await registry.chatWithProvider(request);

    expect(outcome.provider.id).toBe("nvidia-nim");
    expect(outcome.result.text).toBe("ok");
    // Accepted as a plain ChatResult too — the switch is invisible to callers.
    await expect(registry.chat(request)).resolves.toMatchObject({ text: "ok" });
    expect(groq.calls()).toBe(3); // first attempt + 2 retries
    expect(nvidia.calls()).toBe(2); // one per chat() call
    expect(onSwitch).toHaveBeenCalledWith("groq", "nvidia-nim", expect.anything());
  });

  it("throws an aggregate error when every provider fails", async () => {
    const a = fakeProvider("a", { failTimes: 99, error: new Error("500 internal server error") });
    const b = fakeProvider("b", { failTimes: 99, error: new Error("503 service unavailable") });
    const registry = createRegistry({ providers: [a.provider, b.provider], sleep: noSleep });
    await expect(registry.chat(request)).rejects.toThrow(/All providers failed/);
  });

  it("does not retry a non-retryable error (401) — it fails over immediately", async () => {
    const auth = fakeProvider("groq", { failTimes: 99, error: new Error("401 unauthorized: invalid api key") });
    const backup = fakeProvider("nvidia-nim");
    const registry = createRegistry({ providers: [auth.provider, backup.provider], sleep: noSleep });

    const outcome = await registry.chatWithProvider(request);

    expect(outcome.provider.id).toBe("nvidia-nim");
    expect(auth.calls()).toBe(1);
  });

  it("gates out an unhealthy provider while a healthy one can answer", async () => {
    const sick = fakeProvider("sick", {
      failTimes: 99,
      health: { ok: false, provider: "sick", checkedAt: 0 },
    });
    const well = fakeProvider("well", { health: { ok: true, provider: "well", checkedAt: 0 } });
    const registry = createRegistry({ providers: [sick.provider, well.provider], sleep: noSleep });

    await registry.checkHealth();
    const outcome = await registry.chatWithProvider(request);

    expect(outcome.provider.id).toBe("well");
    expect(sick.calls()).toBe(0);
  });
});

describe("FailoverRegistry — retry with backoff", () => {
  it("retries the same provider with exponential backoff before succeeding", async () => {
    const flaky = fakeProvider("flaky", { failTimes: 2, error: new Error("502 bad gateway") });
    const delays: number[] = [];
    const registry = createRegistry({
      providers: [flaky.provider],
      maxRetries: 3,
      baseDelayMs: 250,
      maxDelayMs: 4_000,
      sleep: async (ms) => {
        delays.push(ms);
      },
    });

    const result = await registry.chat(request);

    expect(result.text).toBe("ok");
    expect(flaky.calls()).toBe(3);
    expect(delays).toEqual([250, 500]);
    expect(registry.metrics("flaky").retries).toBe(2);
  });

  it("caps the backoff delay at maxDelayMs", async () => {
    const flaky = fakeProvider("flaky", { failTimes: 3, error: new Error("503 service unavailable") });
    const delays: number[] = [];
    const registry = createRegistry({
      providers: [flaky.provider],
      maxRetries: 3,
      baseDelayMs: 1_000,
      maxDelayMs: 1_500,
      sleep: async (ms) => {
        delays.push(ms);
      },
    });

    await registry.chat(request);

    expect(delays).toEqual([1000, 1500, 1500]);
  });
});

describe("FailoverRegistry — cost + latency accounting", () => {
  it("accumulates tokens, cost and average latency per provider", async () => {
    const provider = fakeProvider("metered");
    let tick = 1_000;
    const now = () => {
      const value = tick;
      tick += 10;
      return value;
    };
    const registry = createRegistry({
      providers: [provider.provider],
      now,
      costTable: { metered: { inputPer1M: 2, outputPer1M: 4 } },
    });

    await registry.chat(request);

    const metrics = registry.metrics("metered");
    expect(metrics.attempts).toBe(1);
    expect(metrics.successes).toBe(1);
    expect(metrics.lastLatencyMs).toBe(10);
    expect(metrics.avgLatencyMs).toBe(10);
    expect(metrics.promptTokens).toBe(100);
    expect(metrics.completionTokens).toBe(50);
    // 100/1e6*2 + 50/1e6*4 = 0.0004
    expect(metrics.costUsd).toBeCloseTo(0.0004, 10);
  });

  it("records failures and marks the provider unhealthy", async () => {
    const provider = fakeProvider("down", { failTimes: 99, error: new Error("503 service unavailable") });
    const registry = createRegistry({ providers: [provider.provider], sleep: noSleep });

    await expect(registry.chat(request)).rejects.toThrow();

    const metrics = registry.metrics("down");
    expect(metrics.failures).toBe(3);
    expect(metrics.successes).toBe(0);
    expect(metrics.unhealthyUntil).toBeGreaterThan(0);
    expect(registry.isUnhealthy("down")).toBe(true);
  });
});

describe("FailoverRegistry — construction", () => {
  it("rejects a duplicate provider id", () => {
    const registry = createRegistry({ providers: [fakeProvider("dup").provider] });
    expect(() => registry.register(fakeProvider("dup").provider)).toThrow(/already registered/);
  });

  it("wraps a raw error in a ProviderError with a kind", () => {
    const error = new ProviderError("429 too many requests", { provider: "groq" });
    expect(error.kind).toBe("rate-limit");
    expect(error.retryable).toBe(true);
  });
});
