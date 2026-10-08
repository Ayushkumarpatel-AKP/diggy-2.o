import { describe, expect, it } from "vitest";
import { crawlWithCrawlee, isCrawleeEnabled } from "../src/crawlee.js";
import { crawl, crawlDirect } from "../src/crawl.js";

describe("isCrawleeEnabled", () => {
  it("is enabled by default", () => {
    expect(isCrawleeEnabled({})).toBe(true);
    expect(isCrawleeEnabled({ DIGGY_CRAWLEE: "" })).toBe(true);
    expect(isCrawleeEnabled({ DIGGY_CRAWLEE: "1" })).toBe(true);
  });

  it("is disabled by DIGGY_CRAWLEE=0/false", () => {
    expect(isCrawleeEnabled({ DIGGY_CRAWLEE: "0" })).toBe(false);
    expect(isCrawleeEnabled({ DIGGY_CRAWLEE: "false" })).toBe(false);
    expect(isCrawleeEnabled({ DIGGY_CRAWLEE: "FALSE" })).toBe(false);
  });

  it("exposes crawlWithCrawlee and crawlDirect as functions", () => {
    expect(typeof crawlWithCrawlee).toBe("function");
    expect(typeof crawlDirect).toBe("function");
    expect(typeof crawl).toBe("function");
  });
});
