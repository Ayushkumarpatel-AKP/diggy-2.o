import { describe, expect, it } from "vitest";

import {
  LONG_STATUS_MAX,
  insertByPriority,
  truncateStatus,
  type StatusItem,
} from "./statusQueue.js";

function item(id: string, priority: StatusItem["priority"]): StatusItem {
  return { id, text: id, priority, style: "thought" };
}

describe("insertByPriority", () => {
  it("places higher priority ahead of lower", () => {
    const queue = insertByPriority([item("a", 1)], item("b", 3));
    expect(queue.map((q) => q.id)).toEqual(["b", "a"]);
  });

  it("keeps arrival order for equal priority", () => {
    let queue: StatusItem[] = [];
    queue = insertByPriority(queue, item("a", 2));
    queue = insertByPriority(queue, item("b", 2));
    queue = insertByPriority(queue, item("c", 2));
    expect(queue.map((q) => q.id)).toEqual(["a", "b", "c"]);
  });

  it("interleaves mixed priorities deterministically", () => {
    let queue: StatusItem[] = [];
    queue = insertByPriority(queue, item("low", 0));
    queue = insertByPriority(queue, item("high", 3));
    queue = insertByPriority(queue, item("mid", 2));
    expect(queue.map((q) => q.id)).toEqual(["high", "mid", "low"]);
  });

  it("does not mutate the input queue", () => {
    const original = [item("a", 1)];
    insertByPriority(original, item("b", 2));
    expect(original.map((q) => q.id)).toEqual(["a"]);
  });

  it("replaces a queued item when the id repeats", () => {
    let queue: StatusItem[] = [];
    queue = insertByPriority(queue, item("live", 1));
    queue = insertByPriority(queue, { ...item("live", 1), text: "step 2" });
    expect(queue).toHaveLength(1);
    expect(queue[0]?.text).toBe("step 2");
  });
});

describe("truncateStatus", () => {
  it("collapses whitespace", () => {
    expect(truncateStatus("  Monitoring\n  website…  ")).toBe("Monitoring website…");
  });

  it("clips with an ellipsis past the limit", () => {
    const result = truncateStatus("x".repeat(100), 10);
    expect(result).toHaveLength(10);
    expect(result.endsWith("…")).toBe(true);
  });

  it("keeps the 68-char one-line default", () => {
    expect(truncateStatus("x".repeat(100))).toHaveLength(68);
  });

  it("offers a long-form cap for action-describing lines", () => {
    expect(LONG_STATUS_MAX).toBeGreaterThan(68);
    const text = "x".repeat(LONG_STATUS_MAX + 50);
    expect(truncateStatus(text, LONG_STATUS_MAX)).toHaveLength(LONG_STATUS_MAX);
    expect(truncateStatus(text, LONG_STATUS_MAX).endsWith("…")).toBe(true);
  });
});
