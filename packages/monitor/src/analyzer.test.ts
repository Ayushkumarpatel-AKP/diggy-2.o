import { describe, expect, it } from "vitest";
import {
  analyzeDetection,
  createCoreAnalyzer,
  createHeuristicAnalyzer,
  isOffline,
  parseAnalysisJson,
} from "./analyzer.js";
import type { Detection } from "./watches.js";

const detection: Detection = {
  kind: "registration_open",
  eventKey: "m:w:registration:open",
  title: "Portal",
  summary: "Registration looks open.",
  evidence: "apply online",
  severity: "critical",
};

describe("heuristic analyzer", () => {
  it("passes the detection through unchanged", async () => {
    const result = await analyzeDetection(createHeuristicAnalyzer(), "https://e", detection);
    expect(result).toEqual({
      title: "Portal",
      summary: "Registration looks open.",
      severity: "critical",
      analyzedBy: "heuristic",
    });
  });
});

describe("core analyzer fallback", () => {
  it("falls back to the heuristic when offline", async () => {
    const analyzer = createCoreAnalyzer({ offline: true });
    const result = await analyzeDetection(analyzer, "https://e", detection);
    expect(result.analyzedBy).toBe("heuristic");
  });

  it("falls back to the heuristic when no provider key is configured", async () => {
    const analyzer = createCoreAnalyzer({ offline: false, env: {} });
    const result = await analyzeDetection(analyzer, "https://e", detection);
    expect(result.analyzedBy).toBe("heuristic");
  });
});

describe("isOffline", () => {
  it("is true under the test runner and the explicit flag", () => {
    expect(isOffline({ NODE_ENV: "test" })).toBe(true);
    expect(isOffline({ DIGGY_OFFLINE: "1" })).toBe(true);
    expect(isOffline({ NODE_ENV: "production" })).toBe(false);
  });
});

describe("parseAnalysisJson", () => {
  it("parses fenced, bare and prose-wrapped JSON", () => {
    expect(parseAnalysisJson('```json\n{"title":"T","severity":"high"}\n```')).toMatchObject({ title: "T", severity: "high" });
    expect(parseAnalysisJson('{"summary":"S"}')).toMatchObject({ summary: "S" });
    expect(parseAnalysisJson('Sure! {"title":"T"} done')).toMatchObject({ title: "T" });
  });

  it("returns undefined for junk", () => {
    expect(parseAnalysisJson("no json here")).toBeUndefined();
    expect(parseAnalysisJson("{not json}")).toBeUndefined();
  });
});
