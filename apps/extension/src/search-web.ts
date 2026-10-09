/**
 * Web search for the agent — hosted first, local second, keyless last.
 *
 * Order matters and is deliberate:
 *
 * 1. **Tavily** (`POST /search`, Bearer key) — best quality, and the only path
 *    that returns a synthesised answer.
 * 2. **Local crawler** (`127.0.0.1:17322/search`) — your own service. Used when
 *    there is no key, or when Tavily is rate-limited / out of quota / down, so a
 *    spent key degrades instead of breaking search.
 * 3. **Keyless Tavily** — the documented `X-Tavily-Access-Mode: keyless` mode,
 *    rate-limited but needs no credential at all.
 *
 * The chain is why "real-time answers" keeps working on a free tier. Nothing
 * here throws: every failure moves to the next provider and the last error is
 * reported so the agent can say what went wrong instead of inventing an answer.
 */
import type { SendToPage } from "./page-tools.js";

const TAVILY_BASE = "https://api.tavily.com";
const DEFAULT_CRAWLER = "http://127.0.0.1:17322";
const DEFAULT_MAX = 5;
const SNIPPET_CHARS = 400;

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchOutcome {
  ok: boolean;
  provider: "tavily" | "local" | "keyless" | "none";
  results: SearchResult[];
  /** Tavily's synthesised answer, when asked for and available. */
  answer?: string;
  error?: string;
}

/** The web-search settings the settings page writes under `diggy:search`. */
export interface SearchSettings {
  tavilyKey?: string;
  preferLocal?: boolean;
  crawlerBase?: string;
}

export interface SearchOptions extends SearchSettings {
  query: string;
  max?: number;
  includeAnswer?: boolean;
  /** Injected for tests. */
  fetchImpl?: typeof fetch;
}

function clip(text: unknown, max = SNIPPET_CHARS): string {
  const value = typeof text === "string" ? text.replace(/\s+/g, " ").trim() : "";
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalize(raw: unknown): SearchResult[] {
  if (!Array.isArray(raw)) return [];
  const out: SearchResult[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as Record<string, unknown>;
    const url = str(row["url"]);
    if (url === "") continue;
    out.push({
      title: clip(row["title"], 160) || url,
      url,
      snippet: clip(row["content"] ?? row["snippet"] ?? row["description"]),
    });
  }
  return out;
}

async function tavily(options: SearchOptions, keyless: boolean): Promise<SearchOutcome> {
  const call = options.fetchImpl ?? fetch;
  const max = Math.max(1, Math.min(options.max ?? DEFAULT_MAX, 10));
  const body: Record<string, unknown> = {
    query: options.query,
    max_results: max,
    search_depth: "basic",
  };
  if (options.includeAnswer) body["include_answer"] = true;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (keyless) headers["X-Tavily-Access-Mode"] = "keyless";
  else headers["Authorization"] = `Bearer ${options.tavilyKey ?? ""}`;

  const response = await call(`${TAVILY_BASE}/search`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Tavily ${response.status}${response.status === 429 ? " (rate limited)" : ""}`);
  }
  const json = (await response.json()) as Record<string, unknown>;
  const outcome: SearchOutcome = {
    ok: true,
    provider: keyless ? "keyless" : "tavily",
    results: normalize(json["results"]),
  };
  const answer = str(json["answer"]).trim();
  if (answer !== "") outcome.answer = answer;
  return outcome;
}

/** The local crawler's `/search`. Treated as best-effort. */
async function local(options: SearchOptions): Promise<SearchOutcome> {
  const call = options.fetchImpl ?? fetch;
  const base = (options.crawlerBase ?? DEFAULT_CRAWLER).replace(/\/+$/, "");
  const max = Math.max(1, Math.min(options.max ?? DEFAULT_MAX, 10));
  const response = await call(
    `${base}/search?q=${encodeURIComponent(options.query)}&max=${max}`,
    { method: "GET" },
  );
  if (!response.ok) throw new Error(`Local crawler ${response.status}`);
  const json = (await response.json()) as Record<string, unknown>;
  const results = normalize(json["results"] ?? json["items"] ?? json);
  return { ok: true, provider: "local", results };
}

/** Try each provider in order, keeping the last real error for the report. */
export async function searchWeb(options: SearchOptions): Promise<SearchOutcome> {
  const query = options.query.trim();
  if (query === "") return { ok: false, provider: "none", results: [], error: "A query is required." };

  const attempts: (() => Promise<SearchOutcome>)[] = [];
  const key = options.tavilyKey?.trim();

  if (options.preferLocal) {
    attempts.push(() => local(options));
    if (key) attempts.push(() => tavily(options, false));
  } else {
    if (key) attempts.push(() => tavily(options, false));
    attempts.push(() => local(options));
  }
  // Last resort: Tavily's documented keyless mode needs no credential at all.
  attempts.push(() => tavily(options, true));

  let lastError = "";
  for (const attempt of attempts) {
    try {
      const outcome = await attempt();
      if (outcome.ok && outcome.results.length > 0) return outcome;
      if (outcome.ok) lastError = "no results";
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  return {
    ok: false,
    provider: "none",
    results: [],
    error: lastError || "Every search provider failed.",
  };
}

/** Fetch one page as clean text (Tavily extract → crawler markdown). */
export async function fetchPageText(
  url: string,
  options: SearchSettings & { fetchImpl?: typeof fetch } = {},
): Promise<{ ok: boolean; text: string; provider: string; error?: string }> {
  const call = options.fetchImpl ?? fetch;
  const key = options.tavilyKey?.trim();

  if (key) {
    try {
      const response = await call(`${TAVILY_BASE}/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ urls: [url] }),
      });
      if (response.ok) {
        const json = (await response.json()) as Record<string, unknown>;
        const results = Array.isArray(json["results"]) ? json["results"] : [];
        const first = results[0] as Record<string, unknown> | undefined;
        const text = clip(first?.["raw_content"], 8000);
        if (text !== "") return { ok: true, text, provider: "tavily" };
      }
    } catch {
      /* fall through to the crawler */
    }
  }

  try {
    const base = (options.crawlerBase ?? DEFAULT_CRAWLER).replace(/\/+$/, "");
    const response = await call(`${base}/markdown?url=${encodeURIComponent(url)}`);
    if (response.ok) {
      const json = (await response.json()) as Record<string, unknown>;
      const text = clip(json["markdown"] ?? json["text"], 8000);
      if (text !== "") return { ok: true, text, provider: "local" };
    }
  } catch {
    /* reported below */
  }

  return { ok: false, text: "", provider: "none", error: "Could not read that page." };
}

/** A deterministic string sent to the model. Kept small on purpose. */
export function renderSearch(outcome: SearchOutcome): string {
  if (!outcome.ok) return `Search failed: ${outcome.error ?? "unknown error"}`;
  const lines: string[] = [];
  if (outcome.answer) lines.push(`Answer: ${outcome.answer}`, "");
  outcome.results.forEach((result, index) => {
    lines.push(`${index + 1}. ${result.title}`, `   ${result.url}`, `   ${result.snippet}`);
  });
  lines.push("", `(via ${outcome.provider})`);
  return lines.join("\n");
}

/** The page bridge is unused here but keeps the signature symmetrical in tools. */
export type { SendToPage };
