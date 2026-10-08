# Worker brief — monitor

Read `agents/ORCHESTRATION_BRIEF.md` first.

## Goal

The **Monitor Engine** — DIGGY's main USP. Users watch websites; DIGGY detects changes and alerts
them before they notice. Implement `MonitorAPI` from `packages/shared/src/contracts/monitor.ts`, and
the crawler service that feeds it.

## Owns (only edit these)

`packages/monitor/**`, `services/crawler/**`.

## Deliverables

1. `packages/monitor/src/watches.ts`: `WatchSpec` store (max ~50 watches), `MonitorKind` detection
   (content_change, keyword, new_post, registration_open, deadline_change, release_published,
   price_change, custom). Port the proven `watches.ts` hash/keyword diff from
   `C:\Users\Ayush\orca\projects\diggy\apps\extension\src\watches.ts`.
2. `packages/monitor/src/engine.ts`: the loop — Source → fetch → **baseline on first check** →
   detect change → **AI analysis** (call `@diggy/core`) → emit `MonitorEvent` → notify → avatar alert.
   **Dedupe stable events by `eventKey`** (webbrain `/watch` semantics). `keep` re-arms.
3. Scheduler via `chrome.alarms` in the extension + a server-side scheduler in the crawler service.
4. `services/crawler` (Fastify): keep existing `/extract /crawl /search /markdown /transcript /feed /reach`;
   make **Crawlee + Playwright** the crawling backbone; keep Readability + Cheerio/JSDOM.
5. Extraction adapters behind one interface: in-repo (Readability) primary; optional Python sidecar
   (Crawl4AI / trafilatura / Newspaper4k / ScrapeGraphAI) documented + dockerized but **not a build dep**;
   hosted **Firecrawl (API only — AGPL, do not vendor) + Jina Reader** as fallbacks.
6. `site-adapters.ts`: versioned per-site guidance (deadline selectors, registration flags).

## Constraints / do-not-touch

- Edit only `packages/monitor/**` and `services/crawler/**`.
- Respect `robots.txt` and site terms; never bypass CAPTCHA/OTP.
- Never auto-submit anything; monitors observe only.
- Python sidecar must be optional (feature-flagged) so the Node build never depends on it.

## Observable acceptance

- A fixture-based test: first check establishes baseline (no event); second check with changed content
  emits exactly one event; a third identical check emits none (dedupe); `keep` re-arms.
- `pnpm -w typecheck` + `pnpm -w build` green; crawler service starts and `/extract` returns clean text.

## Report

Files changed, exact test command + result, and which extraction adapters are wired vs. stubbed.
