import { describe, expect, it } from "vitest";

import type { ChatMessage } from "@diggy/shared";
import {
  CONVERSATION_SUMMARY_PREFIX,
  capToolResult,
  compactMessages,
  compactWithOverflowRecovery,
  limitToolResults,
  shouldCompact,
  totalTokens,
} from "./compaction.js";
import { ConversationWindow, TabConversationStore } from "./conversation.js";
import { createMemoryUserMemoryPersistence, createUserMemory } from "./user-memory.js";

describe("capToolResult", () => {
  it("returns short text unchanged and caps long text under the limit", () => {
    expect(capToolResult("short", 50)).toBe("short");
    const capped = capToolResult("x".repeat(200), 50);
    expect(capped.length).toBeLessThanOrEqual(50);
    expect(capped).toContain("truncated");
  });

  it("returns empty for a zero cap", () => {
    expect(capToolResult("anything", 0)).toBe("");
  });

  it("caps only tool messages", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "u".repeat(100) },
      { role: "tool", content: "t".repeat(100), toolCallId: "c1", name: "readPage" },
    ];
    const limited = limitToolResults(messages, 20);
    expect(limited[0]?.content.length).toBe(100);
    expect(limited[1]?.content.length).toBeLessThanOrEqual(20);
  });
});

describe("compactMessages", () => {
  const history: ChatMessage[] = [
    { role: "system", content: "sys" },
    { role: "user", content: "A".repeat(40) },
    { role: "assistant", content: "B".repeat(40) },
    { role: "user", content: "C".repeat(40) },
    { role: "assistant", content: "D".repeat(40) },
    { role: "user", content: "E".repeat(40) },
  ];

  it("leaves a short conversation untouched", async () => {
    const result = await compactMessages(history, { maxTokens: 10_000 });
    expect(result.compacted).toBe(false);
    expect(result.messages).toHaveLength(history.length);
  });

  it("folds the middle into a summary and keeps the recent tail", async () => {
    const result = await compactMessages(history, { maxTokens: 30, keepRecent: 2 });
    expect(result.compacted).toBe(true);
    expect(result.dropped).toBe(3);
    expect(result.messages).toHaveLength(4); // system + summary + 2 recent
    expect(result.messages[0]?.role).toBe("system");
    expect(result.messages[1]?.content.startsWith(CONVERSATION_SUMMARY_PREFIX)).toBe(true);
    expect(result.messages[3]?.content.startsWith("E")).toBe(true);
  });

  it("recovers under a tiny budget", async () => {
    const big: ChatMessage[] = Array.from({ length: 20 }, (_, index) => ({
      role: index % 2 === 0 ? "user" : "assistant",
      content: "z".repeat(100),
    }));
    const result = await compactWithOverflowRecovery(big, { maxTokens: 30, keepRecent: 6 });
    expect(result.compacted).toBe(true);
    expect(totalTokens(result.messages)).toBeLessThanOrEqual(30);
  });

  it("reports when compaction is needed", () => {
    expect(shouldCompact(history, 5)).toBe(true);
    expect(shouldCompact(history, 10_000)).toBe(false);
  });
});

describe("TabConversationStore", () => {
  it("isolates history per tab", () => {
    const store = new TabConversationStore();
    store.add(1, { role: "user", content: "tab one" });
    store.add(2, { role: "user", content: "tab two" });
    expect(store.messages(1)).toEqual([{ role: "user", content: "tab one" }]);
    expect(store.messages(2)).toEqual([{ role: "user", content: "tab two" }]);
    store.drop(1);
    expect(store.messages(1)).toEqual([]);
  });

  it("trims a window to its message budget", () => {
    const window = new ConversationWindow({ maxMessages: 2 });
    window.addUser("a");
    window.addUser("b");
    window.addUser("c");
    expect(window.size).toBe(2);
    expect(window.messages().map((message) => message.content)).toEqual(["b", "c"]);
  });
});

describe("UserMemory", () => {
  it("remembers, recalls and renders stated preferences", async () => {
    const memory = createUserMemory({ now: () => new Date("2026-01-01T00:00:00Z") });
    await memory.remember("tone", "casual Hinglish");
    await memory.remember("timezone", "IST", { source: "inferred" });

    expect(await memory.recall("tone")).toBe("casual Hinglish");
    expect((await memory.statedPreferences()).map((fact) => fact.key)).toEqual(["tone"]);

    const prompt = await memory.toPrompt();
    expect(prompt).toContain("# What I know about the user");
    expect(prompt).toContain("- tone: casual Hinglish");

    expect(await memory.forget("tone")).toBe(true);
    expect(await memory.recall("tone")).toBeUndefined();
  });

  it("persists through an injected store", async () => {
    const persistence = createMemoryUserMemoryPersistence();
    const first = createUserMemory({ persistence });
    await first.remember("language", "Hindi");

    const second = createUserMemory({ persistence });
    expect(await second.recall("language")).toBe("Hindi");
  });
});
