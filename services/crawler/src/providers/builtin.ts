import { crawl, fetchPageHtml } from "../crawl.js";
import { extractFromHtml } from "../extract.js";
import { TOTAL_TIMEOUT_MS } from "../ssrf.js";
import type { CrawlInput, CrawlProvider, ProviderExtract, ProviderPage } from "./types.js";

export const BUILTIN_PROVIDER_NAME = "builtin";

/**
 * Wrap the in-process Crawlee+Playwright crawler (`src/crawl.ts`) and
 * Readability extractor (`src/extract.ts`) behind the {@link CrawlProvider}
 * interface. This is the always-available default — no configuration or
 * credentials required.
 */
export function createBuiltinProvider(): CrawlProvider {
  return {
    name: BUILTIN_PROVIDER_NAME,
    available: () => true,
    async crawl(input: CrawlInput): Promise<ProviderPage[]> {
      return crawl({
        url: input.url,
        depth: input.depth,
        maxPages: input.maxPages,
        timeoutMs: input.timeoutMs,
      });
    },
    async extract(url: string): Promise<ProviderExtract> {
      const html = await fetchPageHtml(url, { timeoutMs: TOTAL_TIMEOUT_MS });
      return extractFromHtml(html, url);
    },
  };
}
