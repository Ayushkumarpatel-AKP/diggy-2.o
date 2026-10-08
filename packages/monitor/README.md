# @diggy/monitor

The Monitor Engine — DIGGY's main USP. Users watch websites; DIGGY detects
changes and alerts them before they notice.

Implements the shared `MonitorAPI` contract (`packages/shared/src/contracts/monitor.ts`).

## The loop

```
source.fetch → baseline on first check → MonitorKind diff → @diggy/core analysis
             → MonitorEvent → notify → avatar alert
```

Every boundary is injectable so the engine runs unchanged in the MV3 service
worker, the server-side crawler scheduler and Vitest:

| Boundary | Default | Provided by |
|---|---|---|
| `Source` | — | `createCrawlerSource` (crawler service) / `createFetchSource` |
| `Analyzer` | `createCoreAnalyzer()` | `@diggy/core`, heuristic fallback |
| `Notifier` | noop | `createChromeNotifier` / `createCompositeNotifier` |
| `AvatarAlerter` | noop | `createAvatarAlerter(avatarApi)` |

## Detection semantics

- **Baseline on the first check** — no event; the snapshot hash / price /
  deadline / posts become the reference.
- **Dedupe by `eventKey`** — a stable event alerts exactly once.
- **`keep`** — a `keep` watch stays armed and re-arms keyword / registration
  watches once the condition clears. A non-`keep` watch disarms after its first
  alert (`engine.rearm(id)` re-arms it).
- Kinds: `content_change`, `keyword`, `new_post`, `registration_open`,
  `deadline_change`, `release_published`, `price_change`, `custom`.

## Scheduling

- Extension: `installAlarmsScheduler(chrome.alarms, { engine })` (MV3 `chrome.alarms`).
- Server: `createMonitorScheduler({ engine })` — used by `@diggy/crawler`.
- `engine.due(now)` decides which watches are due, so a missed tick just catches up.

## Site adapters

`site-adapters.ts` holds **versioned** per-site guidance (deadline selectors,
registration flags, price patterns) so recognisable sites yield structured
signals instead of raw text.

## Tests

`src/engine.test.ts` is the acceptance fixture: baseline → change (exactly one
event) → identical (dedupe, none) → `keep` re-arm (one more).
