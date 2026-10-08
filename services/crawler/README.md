# @diggy/crawler

Local-only crawl / extract / research service for DIGGY 2.0. Binds **127.0.0.1
only** and guards every request with the per-install `x-diggy-token`
(`src/service-auth.ts`), Host and Origin validation.

## Crawling backbone

**Crawlee + Playwright** is the primary engine (`src/crawlee.ts`, using
`PlaywrightCrawler` with in-memory storage and `respectRobotsTxtFile: true`).
If no browser is available it degrades to the direct-Playwright BFS in
`src/crawl.ts`. Disable Crawlee with `DIGGY_CRAWLEE=0`.

Extraction is **Readability + a hand-written HTML→Markdown converter**
(`src/extract.ts`), offline and deterministic; `src/markdown.ts` adds
PDF (pdf-parse) and DOCX (mammoth) conversion.

## HTTP endpoints

| Route | Method | Notes |
|---|---|---|
| `/health` | GET | Liveness + provider/reach/monitor summary (token-exempt). |
| `/providers` | GET | Provider surface (default + experimental). |
| `/extract` | POST | `{ url?, html?, provider? }` → clean title + markdown. |
| `/crawl` | POST | `{ url, depth?, maxPages?, provider? }` → pages. |
| `/search` | GET | `q` → DuckDuckGo HTML (Bing fallback). |
| `/markdown` | POST | `{ base64, filename }` → markdown. |
| `/transcript` | GET | `url, lang?` → YouTube transcript via `yt-dlp`. |
| `/feed` | GET | `url, max?` → parsed RSS/Atom items. |
| `/reach` | GET | `agent-reach doctor` probe. |
| `/monitor` | GET | Server-side monitor scheduler status. |

## Extraction adapters — one interface (`CrawlProvider`)

Wired and active by default:

- **`builtin`** — Crawlee + Playwright crawl, Readability extract. Always available.
- **`reach`** — `agent-reach` capability layer: yt-dlp transcripts, RSS/Atom feeds,
  Jina Reader last-resort page read (feature-flagged, see below).

Wired but **opt-in only** (never part of default routing; `experimentalProviders(true)`):

- **`firecrawl`** — hosted Firecrawl API (`FIRECRAWL_API_KEY`). **API only** (AGPL — never vendored).
- **`crawl4ai`** — self-hosted Crawl4AI server (`CRAWL4AI_URL`).
- **`browser-use`** — agentic browser service (`BROWSER_USE_URL`).
- **`python-sidecar`** — the optional Python extractor tier (`PYTHON_EXTRACTOR_URL`).

Stubbed / documented only (no Node build dependency):

- **Python tier** — `docker/python-extractor/` packages trafilatura / Newspaper4k
  (and is the home for Crawl4AI / ScrapeGraphAI if enabled). The Node build never
  imports Python; the `python-sidecar` adapter is `available()` only when
  `PYTHON_EXTRACTOR_URL` is set.

## Feature flags / env

| Env | Effect |
|---|---|
| `DIGGY_TOKEN` | Per-install bearer token (else `~/.diggy/token`). |
| `DIGGY_CRAWLEE` | `0`/`false` disables the Crawlee backbone. |
| `DIGGY_JINA` | `1` enables the Jina Reader fallback. |
| `DIGGY_OFFLINE` | `1` disables all outbound network (also on in tests). |
| `FIRECRAWL_API_KEY` / `FIRECRAWL_API_BASE` | Firecrawl (hosted). |
| `CRAWL4AI_URL` / `BROWSER_USE_URL` | Self-hosted vendor adapters. |
| `PYTHON_EXTRACTOR_URL` | Optional Python sidecar. |
| `DIGGY_MONITOR_SCHEDULER` | `1` starts the server-side monitor scheduler. |

## Monitor scheduler

`src/monitor-scheduler.ts` hosts the always-on scheduler: it builds a
`@diggy/monitor` engine whose source calls back into this service (`POST
/extract` + `GET /feed`), persists watches to `~/.diggy/monitor-watches.json`,
and ticks on an interval. The extension uses `chrome.alarms` instead.

## Scripts

```bash
pnpm --filter @diggy/crawler start   # tsx src/main.ts
pnpm --filter @diggy/crawler test
pnpm --filter @diggy/crawler typecheck
```
