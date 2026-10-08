import { describe, expect, it } from "vitest";
import { parseBrowserUseResult } from "../src/providers/experimental/browser-use.js";
import { mapCrawl4aiItem } from "../src/providers/experimental/crawl4ai.js";
import { mapFirecrawlDocument } from "../src/providers/experimental/firecrawl.js";
import { mapSidecarResponse } from "../src/providers/experimental/python-sidecar.js";

describe("firecrawl mapper", () => {
  it("maps a document with metadata", () => {
    const page = mapFirecrawlDocument(
      { markdown: "# Hi", metadata: { title: "T", sourceURL: "https://e/x" } },
      "https://fallback",
    );
    expect(page).toEqual({ url: "https://e/x", title: "T", markdown: "# Hi" });
  });

  it("falls back to the provided url", () => {
    const page = mapFirecrawlDocument({ content: "body" }, "https://fallback");
    expect(page.url).toBe("https://fallback");
    expect(page.markdown).toBe("body");
  });
});

describe("crawl4ai mapper", () => {
  it("maps a result item", () => {
    const page = mapCrawl4aiItem(
      { url: "https://e/x", metadata: { title: "T" }, fit_markdown: "md" },
      "https://fallback",
    );
    expect(page).toEqual({ url: "https://e/x", title: "T", markdown: "md" });
  });
});

describe("browser-use mapper", () => {
  it("extracts nested text and a title", () => {
    const result = parseBrowserUseResult(
      { title: "Page", final_result: "hello world" },
      "https://fallback",
    );
    expect(result).toEqual({ title: "Page", markdown: "hello world" });
  });
});

describe("python-sidecar mapper", () => {
  it("prefers markdown and falls back to text", () => {
    expect(mapSidecarResponse({ markdown: "m", text: "t", title: "T" }, "https://e")).toEqual({
      title: "T",
      markdown: "m",
    });
    expect(mapSidecarResponse({ text: "t" }, "https://e")).toEqual({
      title: "https://e",
      markdown: "t",
    });
  });
});
