import * as robotsParserModule from "robots-parser";

/** The subset of a parsed robots.txt this module uses. */
interface Robot {
  isAllowed(url: string, ua?: string): boolean | undefined;
  getCrawlDelay(ua?: string): number | undefined;
}

type RobotsParser = (url: string, robotstxt: string) => Robot;

// `robots-parser` ships CJS with an ambient `declare module` shim, so under
// NodeNext the callable can arrive as either the namespace or its `default`.
const robotsParser: RobotsParser =
  (robotsParserModule as unknown as { default?: RobotsParser }).default ??
  (robotsParserModule as unknown as RobotsParser);

/** Default User-Agent used by the crawler when none is supplied. */
export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (compatible; DiggyBot/0.1; +https://github.com/diggy)";

/** Parse a robots.txt body for the given URL. */
export function parseRobots(url: string, body: string) {
  return robotsParser(robotsUrlFor(url), body);
}

/** Build the canonical `.../robots.txt` URL for an origin (or any URL). */
export function robotsUrlFor(url: string): string {
  try {
    return new URL("/robots.txt", url).toString();
  } catch {
    return url;
  }
}

/** True when `url` may be fetched for `userAgent` per the robots.txt body. */
export function isUrlAllowed(
  robotsTxt: string | null | undefined,
  url: string,
  userAgent: string = "*",
): boolean {
  if (!robotsTxt || !robotsTxt.trim()) return true;
  try {
    const robots = robotsParser(robotsUrlFor(url), robotsTxt);
    return robots.isAllowed(url, userAgent) !== false;
  } catch {
    return true;
  }
}

/** Crawl-delay declared for `userAgent`, in milliseconds (or `undefined`). */
export function getCrawlDelayMs(
  robotsTxt: string | null | undefined,
  url: string,
  userAgent: string = "*",
): number | undefined {
  if (!robotsTxt || !robotsTxt.trim()) return undefined;
  try {
    const robots = robotsParser(robotsUrlFor(url), robotsTxt);
    const seconds = robots.getCrawlDelay(userAgent);
    if (typeof seconds !== "number" || Number.isNaN(seconds) || seconds <= 0) return undefined;
    return seconds * 1000;
  } catch {
    return undefined;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Extract the host key used for per-host rate limiting. */
export function hostKeyFor(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Serializes same-host requests so at least `minIntervalMs` elapses between. */
export class HostRateLimiter {
  private readonly minIntervalMs: number;
  private readonly lastRequestAt = new Map<string, number>();
  private readonly chains = new Map<string, Promise<void>>();

  constructor(minIntervalMs = 1000) {
    this.minIntervalMs = Math.max(0, minIntervalMs);
  }

  /** Wait until it is safe to issue the next request to `host`. */
  async wait(host: string): Promise<void> {
    const previous = this.chains.get(host) ?? Promise.resolve();
    const next = previous.then(() => this.handleRequest(host));
    this.chains.set(
      host,
      next.catch(() => undefined),
    );
    return next;
  }

  private async handleRequest(host: string): Promise<void> {
    const last = this.lastRequestAt.get(host);
    if (typeof last === "number") {
      const elapsed = Date.now() - last;
      if (elapsed < this.minIntervalMs) {
        await sleep(this.minIntervalMs - elapsed);
      }
    }
    this.lastRequestAt.set(host, Date.now());
  }

  /** Forget the recorded timings (optionally for a single host). */
  reset(host?: string): void {
    if (host === undefined) {
      this.lastRequestAt.clear();
      this.chains.clear();
      return;
    }
    this.lastRequestAt.delete(host);
    this.chains.delete(host);
  }
}
