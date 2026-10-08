import { describe, expect, it } from "vitest";

import {
  DIGGY_SYSTEM_PROMPT,
  buildSystemPrompt,
  currentTimeContext,
  extendSystemPrompt,
  layerSystemPrompt,
  normalizeMode,
  overrideSystemPrompt,
  temperatureFor,
} from "./prompt.js";

describe("deterministic temperatures", () => {
  it("uses 0.15 / 0.3 / 0 for browser-control / ask / vision", () => {
    expect(temperatureFor("browser-control")).toBe(0.15);
    expect(temperatureFor("ask")).toBe(0.3);
    expect(temperatureFor("vision")).toBe(0);
  });

  it("normalises unknown modes to ask", () => {
    expect(normalizeMode("nonsense")).toBe("ask");
    expect(normalizeMode("vision")).toBe("vision");
  });
});

describe("prompt layering", () => {
  it("appends on extend and replaces on override", () => {
    expect(layerSystemPrompt("base", [{ mode: "extend", content: "extra" }])).toBe("base\n\nextra");
    expect(
      layerSystemPrompt("base", [
        { mode: "override", content: "fresh" },
        { mode: "extend", content: "more" },
      ]),
    ).toBe("fresh\n\nmore");
  });

  it("has thin extend/override helpers", () => {
    expect(extendSystemPrompt("base", "extra")).toBe("base\n\nextra");
    expect(overrideSystemPrompt("base", "fresh")).toBe("fresh");
  });

  it("builds persona → layers → time → context", () => {
    const prompt = buildSystemPrompt({
      layers: [{ mode: "extend", content: "# Host layer" }],
      context: "Active tab: example.com",
      now: new Date("2026-10-08T12:00:00Z"),
    });
    expect(prompt).toContain(DIGGY_SYSTEM_PROMPT);
    expect(prompt).toContain("# Host layer");
    expect(prompt).toContain("# Right now");
    expect(prompt).toContain("# Context\nActive tab: example.com");
  });

  it("omits the time block when asked", () => {
    const prompt = buildSystemPrompt({ includeTime: false });
    expect(prompt).not.toContain("# Right now");
    expect(prompt).toContain(DIGGY_SYSTEM_PROMPT);
  });

  it("renders a UTC/local time context", () => {
    expect(currentTimeContext(new Date("2026-10-08T12:00:00Z"))).toContain("# Right now");
  });
});
