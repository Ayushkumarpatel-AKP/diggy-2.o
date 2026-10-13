import { describe, expect, it } from "vitest";
import type { AgentStepView } from "@diggy/shared";
import { isRunFinished, runStateLabel, runStateTone, stepSummary } from "./runView.js";

describe("runStateLabel", () => {
  it("labels the phases a user sees", () => {
    expect(runStateLabel("planning")).toBe("Planning");
    expect(runStateLabel("awaiting-approval")).toBe("Waiting for you");
    expect(runStateLabel("completed")).toBe("Done");
    expect(runStateLabel("failed")).toBe("Couldn’t finish");
  });
});

describe("runStateTone", () => {
  it("maps terminal states to their tone", () => {
    expect(runStateTone("completed")).toBe("success");
    expect(runStateTone("failed")).toBe("danger");
    expect(runStateTone("awaiting-approval")).toBe("warning");
    expect(runStateTone("executing")).toBe("primary");
  });
});

describe("stepSummary", () => {
  const step = (over: Partial<AgentStepView>): AgentStepView => ({
    index: 0,
    state: "executing",
    tools: ["click"],
    ...over,
  });

  it("marks a verified step, a failed step, and a plain step", () => {
    expect(stepSummary(step({ verified: true }))).toBe("✓ click");
    expect(stepSummary(step({ ok: false }))).toBe("✕ click");
    expect(stepSummary(step({}))).toBe("• click");
    expect(stepSummary(step({ tools: [] }))).toBe("• thinking");
  });
});

describe("isRunFinished", () => {
  it("knows when the run is over", () => {
    expect(isRunFinished("completed")).toBe(true);
    expect(isRunFinished("failed")).toBe(true);
    expect(isRunFinished("executing")).toBe(false);
  });
});
