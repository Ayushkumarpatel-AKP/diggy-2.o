import { describe, expect, it } from "vitest";

import type { ChatRequest, ChatResult } from "@diggy/shared";
import {
  CONTINUE,
  resolveStepBudget,
  runBrain,
  type AgentTool,
  type BrainModel,
} from "./orchestrator.js";

function scriptedModel(answers: ChatResult[]): BrainModel & { calls: ChatRequest[] } {
  const calls: ChatRequest[] = [];
  let index = 0;
  return {
    calls,
    async chat(req: ChatRequest): Promise<ChatResult> {
      calls.push(req);
      const answer = answers[Math.min(index, answers.length - 1)];
      index += 1;
      return answer ?? { text: "", toolCalls: [], finishReason: "stop" };
    },
  };
}

function toolCall(name: string, args: Record<string, unknown> = {}): ChatResult {
  return {
    text: "",
    toolCalls: [{ id: `call_${name}`, name, arguments: args }],
    finishReason: "tool_calls",
  };
}

function say(text: string): ChatResult {
  return { text, toolCalls: [], finishReason: "stop" };
}

const readPage: AgentTool = {
  schema: { name: "readPage", description: "read a page", parameters: { type: "object" } },
  run: () => ({ title: "Example", text: "hello" }),
};

function ticking(start = 0): () => number {
  let value = start;
  return () => {
    value += 1;
    return value;
  };
}

describe("runBrain — step budget + Continue", () => {
  it("stops at the step budget and surfaces a Continue signal", async () => {
    const model = scriptedModel([toolCall("readPage", { url: "https://example.com" })]);
    const result = await runBrain({
      goal: "read the page forever",
      model,
      tools: [readPage],
      planner: false,
      stepBudget: 2,
      clock: ticking(),
      wallClockMs: 10_000_000,
    });

    expect(result.status).toBe("budget-exceeded");
    expect(result.stepsExecuted).toBe(2);
    expect(model.calls).toHaveLength(2);
    expect(result.continue).toBeDefined();
    expect(result.continue?.continue).toBe(true);
    expect(result.continue?.reason).toBe("step-budget");
    expect(result.continue?.message).toContain(CONTINUE);
    expect(result.continue?.stepIndex).toBe(2);
    expect(result.continue?.checkpoint.stepIndex).toBe(2);
  });

  it("resumes from the checkpoint without repeating completed steps", async () => {
    const first = await runBrain({
      goal: "collect facts",
      model: scriptedModel([toolCall("readPage")]),
      tools: [readPage],
      planner: false,
      stepBudget: 1,
      clock: ticking(),
      wallClockMs: 10_000_000,
    });
    expect(first.status).toBe("budget-exceeded");
    expect(first.continue).toBeDefined();

    const resumeModel = scriptedModel([say("all done")]);
    const resumed = await runBrain({
      goal: "collect facts",
      model: resumeModel,
      tools: [readPage],
      planner: false,
      stepBudget: 5,
      resume: first.checkpoint,
      clock: ticking(),
      wallClockMs: 10_000_000,
    });

    expect(resumed.status).toBe("done");
    expect(resumed.text).toBe("all done");
    // The prior tool result survived the checkpoint and is in the resumed prompt.
    expect(resumeModel.calls[0]?.messages.some((message) => message.role === "tool")).toBe(true);
  });

  it("clamps the requested step budget to the hard cap", () => {
    expect(resolveStepBudget()).toMatchObject({ stepBudget: 130, hardCap: 195 });
    expect(resolveStepBudget(500).stepBudget).toBe(195);
    expect(resolveStepBudget(0).stepBudget).toBe(1);
    expect(resolveStepBudget(50).stepBudget).toBe(50);
  });
});

describe("runBrain — plan, act, observe", () => {
  it("plans before acting, then answers", async () => {
    const model = scriptedModel([
      { text: '{"steps": ["open the page", "summarise it"]}', toolCalls: [], finishReason: "stop" },
      say("Here is your summary."),
    ]);
    const result = await runBrain({ goal: "summarise example.com", model, tools: [], clock: ticking(), wallClockMs: 10_000_000 });

    expect(result.plan?.steps).toEqual(["open the page", "summarise it"]);
    expect(result.status).toBe("done");
    expect(result.text).toBe("Here is your summary.");
    expect(model.calls).toHaveLength(2);
    // The planner runs at the planner temperature; the acting turn uses the
    // deterministic ask temperature (default mode).
    expect(model.calls[0]?.temperature).toBe(0.2);
    expect(model.calls[1]?.temperature).toBe(0.3);
  });

  it("executes tool calls and feeds observations back to the model", async () => {
    const model = scriptedModel([toolCall("readPage", { url: "https://example.com" }), say("done")]);
    const result = await runBrain({
      goal: "read example.com",
      model,
      tools: [readPage],
      planner: false,
      mode: "browser-control",
      clock: ticking(),
      wallClockMs: 10_000_000,
    });

    expect(result.status).toBe("done");
    expect(result.steps[0]?.observations[0]).toMatchObject({ ok: true, result: { title: "Example" } });
    expect(result.messages.some((message) => message.role === "tool")).toBe(true);
    expect(model.calls[0]?.temperature).toBe(0.15);
  });

  it("stops immediately when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const model = scriptedModel([say("never")]);
    const result = await runBrain({
      goal: "do nothing",
      model,
      planner: false,
      signal: controller.signal,
      clock: ticking(),
      wallClockMs: 10_000_000,
    });
    expect(result.status).toBe("cancelled");
    expect(model.calls).toHaveLength(0);
  });
});
