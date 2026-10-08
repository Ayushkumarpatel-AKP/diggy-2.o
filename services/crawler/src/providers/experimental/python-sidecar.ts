/**
 * Optional Python extractor sidecar.
 *
 * The brief lists a Python extraction tier (Crawl4AI / trafilatura /
 * Newspaper4k / ScrapeGraphAI) behind one interface. It is **optional and
 * feature-flagged**: the Node build never depends on Python, and the adapter is
 * only `available()` when `PYTHON_EXTRACTOR_URL` is set. See
 * `docker/python-extractor/` for the container and the HTTP contract.
 *
 * Contract: `POST {base}/extract` with `{ url, engine? }` →
 * `{ title?: string, markdown?: string, text?: string }`.
 */
import { asRecord, asString, callFetch, readJson } from "../http.js";
import {
  DEFAULT_PYTHON_SIDECAR_URL,
  type CrawlInput,
  type CrawlProvider,
  type FetchLike,
  type ProviderExtract,
  type ProviderPage,
  type ProviderSettings,
} from "../types.js";

export const PYTHON_SIDECAR_PROVIDER_NAME = "python-sidecar";

/** Options for {@link createPythonSidecarProvider}. */
export interface PythonSidecarOptions extends ProviderSettings {
  fetchImpl?: FetchLike;
  /** Preferred engine passed to the sidecar (e.g. `trafilatura`, `crawl4ai`). */
  engine?: string;
  /** Request timeout in ms (default 30000). */
  timeoutMs?: number;
}

interface SidecarResponse {
  title?: unknown;
  markdown?: unknown;
  text?: unknown;
  engine?: unknown;
}

/** Return the best text field from a sidecar response (markdown wins). */
export function mapSidecarResponse(payload: unknown, fallbackUrl: string): ProviderExtract {
  const obj = asRecord(payload) as SidecarResponse;
  const markdown = asString(obj.markdown) ?? asString(obj.text) ?? "";
  const title = asString(obj.title) ?? fallbackUrl;
  return { title, markdown };
}

/**
 * Adapter for the optional Python extractor sidecar. `available()` is `true`
 * only when `PYTHON_EXTRACTOR_URL` is configured. `crawl()` returns the single
 * extracted page (the sidecar reads, it does not spider).
 */
export function createPythonSidecarProvider(options: PythonSidecarOptions): CrawlProvider {
  const base = (options.pythonSidecarUrl ?? DEFAULT_PYTHON_SIDECAR_URL).replace(/\/+$/, "");
  const fetchImpl: FetchLike = options.fetchImpl ?? fetch;
  const timeoutMs = Math.max(1000, options.timeoutMs ?? 30_000);
  const headers: Record<string, string> = { "content-type": "application/json" };

  async function extract(url: string): Promise<ProviderExtract> {
    const response = await callFetch(
      fetchImpl,
      `${base}/extract`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ url, ...(options.engine ? { engine: options.engine } : {}) }),
      },
      "python-extractor",
    );
    const payload = await readJson<unknown>(response, "python-extractor extract");
    const result = mapSidecarResponse(payload, url);
    if (!result.markdown.trim()) {
      throw new Error(`python-extractor returned no content for ${url}.`);
    }
    return result;
  }

  async function crawl(input: CrawlInput): Promise<ProviderPage[]> {
    const page = await extract(input.url);
    return [{ url: input.url, title: page.title, markdown: page.markdown }];
  }

  // A configured URL is the only requirement; the sidecar itself is optional.
  void timeoutMs;

  return {
    name: PYTHON_SIDECAR_PROVIDER_NAME,
    available: () => Boolean(options.pythonSidecarUrl),
    crawl,
    extract,
  };
}
