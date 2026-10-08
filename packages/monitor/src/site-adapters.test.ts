import { describe, expect, it } from "vitest";
import {
  SITE_ADAPTERS_VERSION,
  extractSignals,
  listSiteAdapters,
  normalizeDeadline,
  parseNumber,
  resolveSiteAdapter,
} from "./site-adapters.js";

describe("resolveSiteAdapter", () => {
  it("matches by hostname substring", () => {
    expect(resolveSiteAdapter("https://www.naukri.com/job/1")?.id).toBe("naukri");
    expect(resolveSiteAdapter("https://github.com/org/repo/releases")?.id).toBe("github-releases");
    expect(resolveSiteAdapter("https://ssc.gov.in/notice")?.id).toBe("gov-exam-portal");
    expect(resolveSiteAdapter("https://unknown.example.org/")?.id).toBeUndefined();
  });

  it("exposes a version on every bundled adapter", () => {
    expect(SITE_ADAPTERS_VERSION).toBeGreaterThan(0);
    for (const adapter of listSiteAdapters()) {
      expect(adapter.version).toBeGreaterThan(0);
    }
  });
});

describe("extractSignals", () => {
  it("pulls a price from a storefront", () => {
    const adapter = resolveSiteAdapter("https://www.amazon.in/dp/B0");
    expect(extractSignals("Deal price ₹1,23,456.00 today", adapter).price).toBe(123456);
  });

  it("pulls a deadline + registration flag from a gov portal", () => {
    const adapter = resolveSiteAdapter("https://ssc.gov.in/notice");
    const signals = extractSignals("Last date: 15/03/2026. Apply Online now.", adapter);
    expect(signals.deadline).toBe("2026-03-15");
    expect(signals.registrationOpen).toBe(true);
  });

  it("pulls a version from a GitHub release", () => {
    const adapter = resolveSiteAdapter("https://github.com/o/r/releases");
    expect(extractSignals("Release v2.4.1 shipped", adapter).version).toBe("2.4.1");
  });

  it("returns {} without an adapter and never throws", () => {
    expect(extractSignals("anything", undefined)).toEqual({});
  });
});

describe("parseNumber / normalizeDeadline", () => {
  it("parses loosely formatted numbers", () => {
    expect(parseNumber("₹1,23,456.78")).toBe(123456.78);
    expect(parseNumber("no digits")).toBeUndefined();
    expect(parseNumber(undefined)).toBeUndefined();
  });

  it("normalises deadlines to ISO dates", () => {
    expect(normalizeDeadline("15 March 2026")).toBe("2026-03-15");
    expect(normalizeDeadline("15/03/2026")).toBe("2026-03-15");
    expect(normalizeDeadline("soon")).toBe("soon");
    expect(normalizeDeadline(undefined)).toBeUndefined();
  });
});
