/**
 * Sources — how a watch turns a URL into a {@link PageSnapshot}.
 *
 * A {@link Source} is the only thing the engine does that can touch the
 * network, so it is injected and easily faked in tests:
 *
 *  - {@link createCrawlerSource} — preferred: calls the local `@diggy/crawler`
 *    service (`POST /extract`, plus `GET /feed` for `new_post` watches), which
 *    runs Readability / Crawlee+Playwright and hands back clean Markdown.
 *  - {@link createFetchSource} — fallback for the extension service worker
 *    (which holds `<all_urls>` host permission): a plain `fetch` + a minimal
 *    HTML→text strip.
 *
 * Both funnel through {@link buildSnapshot}, which applies the versioned
 * {@link resolveSiteAdapter} guidance to pull price/deadline/flag signals.
 */
import type { MonitorKind, WatchSpec } from "@diggy/shared";
import { extractSignals, resolveSiteAdapter, type SiteAdapter } from "./site-adapters.js";
import type { PageSnapshot } from "./watches.js";

/** Turns a watch into a snapshot of the current page state. */
export interface Source {
  fetch(spec: WatchSpec): Promise<PageSnapshot>;
}

/** Minimal `fetch` signature so sources can be unit-tested with a stub. */
export type FetchLike = typeof fetch;

/** Extra inputs a source may discover beyond the extracted text. */
export interface SnapshotInput {
  url: string;
  title: string;
  text: string;
  posts?: { id: string; title: string; url: string }[];
  /** Hostname (used to resolve the site adapter when `url` is unavailable). */
  extra?: {
    price?: number;
    deadline?: string;
    registrationOpen?: boolean;
    version?: string;
  };
}

/**
 * Assemble a snapshot: apply the site adapter to the text, then let explicitly
 * discovered `extra` values win. Pure; never throws.
 */
export function buildSnapshot(
  input: SnapshotInput,
  adapters?: readonly SiteAdapter[],
): PageSnapshot {
  const adapter = resolveSiteAdapter(input.url, adapters);
  const signals = extractSignals(input.text, adapter);
  const snapshot: PageSnapshot = {
    url: input.url,
    title: input.title,
    text: input.text,
  };
  if (input.posts && input.posts.length > 0) snapshot.posts = input.posts;

  const price = input.extra?.price ?? signals.price;
  if (price !== undefined) snapshot.price = price;
  const deadline = input.extra?.deadline ?? signals.deadline;
  if (deadline !== undefined) snapshot.deadline = deadline;
  const registrationOpen = input.extra?.registrationOpen ?? signals.registrationOpen;
  if (registrationOpen !== undefined) snapshot.registrationOpen = registrationOpen;
  const version = input.extra?.version ?? signals.version;
  if (version !== undefined) snapshot.version = version;

  return snapshot;
}

/** Options for {@link createCrawlerSource}. */
export interface CrawlerSourceOptions {
  /** Base URL of the crawler service, e.g. `http://127.0.0.1:17322`. */
  baseUrl: string;
  /** Per-install token sent as `x-diggy-token`. */
  token?: string;
  fetchImpl?: FetchLike;
  /** Override the bundled site adapters. */
  adapters?: readonly SiteAdapter[];
  /** Max feed items pulled for `new_post` watches (default 20). */
  feedMax?: number;
}

interface ExtractResponse {
  title?: string;
  markdown?: string;
  text?: string;
  url?: string;
}

interface FeedResponse {
  items?: { title?: string; link?: string; published?: string; summary?: string }[];
}

function idFromLink(link: string, index: number): string {
  return link || `item-${index}`;
}

const NEEDS_FEED: readonly MonitorKind[] = ["new_post", "release_published"];

/**
 * Source backed by the local crawler service. `new_post`/`release_published`
 * watches additionally pull the site's feed to discover new entries.
 */
export function createCrawlerSource(options: CrawlerSourceOptions): Source {
  const base = options.baseUrl.replace(/\/+$/, "");
  const fetchImpl: FetchLike = options.fetchImpl ?? fetch;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(options.token ? { "x-diggy-token": options.token } : {}),
  };
  const feedMax = Math.max(1, options.feedMax ?? 20);

  async function extract(spec: WatchSpec): Promise<ExtractResponse> {
    const response = await fetchImpl(`${base}/extract`, {
      method: "POST",
      headers,
      body: JSON.stringify({ url: spec.url }),
    });
    if (!response.ok) {
      throw new Error(`crawler /extract failed with HTTP ${response.status}`);
    }
    return (await response.json()) as ExtractResponse;
  }

  async function feed(spec: WatchSpec): Promise<{ id: string; title: string; url: string }[]> {
    try {
      const response = await fetchImpl(
        `${base}/feed?url=${encodeURIComponent(spec.url)}&max=${feedMax}`,
        { headers: options.token ? { "x-diggy-token": options.token } : {} },
      );
      if (!response.ok) return [];
      const body = (await response.json()) as FeedResponse;
      return (body.items ?? []).map((item, index) => ({
        id: idFromLink(item.link ?? "", index),
        title: item.title ?? item.link ?? `item ${index + 1}`,
        url: item.link ?? spec.url,
      }));
    } catch {
      return [];
    }
  }

  return {
    async fetch(spec: WatchSpec): Promise<PageSnapshot> {
      const extracted = await extract(spec);
      const text = extracted.markdown ?? extracted.text ?? "";
      const posts = NEEDS_FEED.includes(spec.kind) ? await feed(spec) : undefined;
      return buildSnapshot(
        {
          url: extracted.url ?? spec.url,
          title: extracted.title ?? spec.url,
          text,
          ...(posts && posts.length > 0 ? { posts } : {}),
        },
        options.adapters,
      );
    },
  };
}

/** Strip tags/scripts into a best-effort text blob (no DOM dependency). */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** Options for {@link createFetchSource}. */
export interface FetchSourceOptions {
  fetchImpl?: FetchLike;
  adapters?: readonly SiteAdapter[];
  /** Per-request timeout in ms (default 20000). */
  timeoutMs?: number;
  headers?: Record<string, string>;
}

/**
 * Minimal source for the extension service worker: fetch the page directly and
 * strip it to text. No feed discovery (the extension uses the shared bus).
 */
export function createFetchSource(options: FetchSourceOptions = {}): Source {
  const fetchImpl: FetchLike = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 20_000;

  return {
    async fetch(spec: WatchSpec): Promise<PageSnapshot> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(spec.url, {
          headers: options.headers ?? { accept: "text/html,application/xhtml+xml" },
          signal: controller.signal,
        });
        const html = await response.text();
        const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? spec.url;
        return buildSnapshot({ url: spec.url, title, text: htmlToPlainText(html) }, options.adapters);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
