/**
 * Crawlee + Playwright backbone.
 *
 * `@diggy/crawler` uses Crawlee's `PlaywrightCrawler` as its primary crawling
 * engine (in-memory storage — the service never writes Crawlee datasets to
 * disk, and robots.txt is respected). The direct-Playwright BFS in `crawl.ts`
 * is the fallback when no browser is available.
 *
 * `DIGGY_CRAWLEE=0` disables Crawlee so the service runs the fallback only
 * (useful in constrained/CI environments).
 */
import { Configuration, PlaywrightCrawler } from "crawlee";
import { extractFromHtml } from "./extract.js";
import { DEFAULT_USER_AGENT } from "./robots.js";
import type { CrawlOptions, CrawlPage } from "./crawl.js";

/** Whether the Crawlee backbone is enabled (default true). */
export function isCrawleeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = env.DIGGY_CRAWLEE?.trim().toLowerCase();
  if (flag === undefined || flag === "") return true;
  return flag !== "0" && flag !== "false";
}

/**
 * Crawl with Crawlee's `PlaywrightCrawler`.
 *
 * - single Crawlee run per call, capped at `maxPages`;
 * - same-origin link following up to `depth`;
 * - each page is passed through Readability ({@link extractFromHtml});
 * - `useChrome` prefers the machine's Google Chrome (`CRAWLEE_CHROME_EXECUTABLE_PATH`
 *   honours a custom path), falling back to Crawlee's bundled Chromium.
 *
 * Throws when Crawlee cannot start a browser or returns nothing so the caller's
 * {@link crawl} can fall back to direct Playwright.
 */
export async function crawlWithCrawlee(options: CrawlOptions): Promise<CrawlPage[]> {
  const maxPages = Math.max(1, options.maxPages ?? 20);
  const maxDepth = Math.max(0, options.depth ?? 1);
  const sameOrigin = options.sameOrigin ?? true;
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  const timeoutMs = options.timeoutMs ?? 30_000;

  const pages: CrawlPage[] = [];

  const crawler = new PlaywrightCrawler(
    {
      maxRequestsPerCrawl: maxPages,
      maxConcurrency: 1,
      respectRobotsTxtFile: true,
      requestHandlerTimeoutSecs: Math.ceil(timeoutMs / 1000) + 10,
      launchContext: {
        useChrome: true,
        useIncognitoPages: true,
        launchOptions: {
          headless: true,
          args: ["--no-first-run", "--no-default-browser-check"],
        },
      },
      async requestHandler({ request, page, enqueueLinks }) {
        const html = await page.content();
        const extracted = extractFromHtml(html, request.url);
        pages.push({ url: request.url, title: extracted.title, markdown: extracted.markdown });

        const depth = Number((request.userData as { depth?: number }).depth ?? 0);
        if (depth < maxDepth) {
          await enqueueLinks({
            strategy: sameOrigin ? "same-origin" : "all",
            userData: { depth: depth + 1 },
          });
        }
      },
    },
    // In-memory storage: no request queue / dataset written to disk.
    new Configuration({ persistStorage: false, purgeOnStart: true }),
  );

  try {
    await crawler.run([{ url: options.url, userData: { depth: 0 }, headers: { "user-agent": userAgent } }]);
  } finally {
    await crawler.teardown().catch(() => undefined);
  }

  return pages;
}
