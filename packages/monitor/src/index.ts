/**
 * @diggy/monitor — the Monitor Engine (DIGGY's main USP).
 *
 * Users watch websites; DIGGY detects changes and alerts them before they
 * notice. This package implements the shared `MonitorAPI` contract, the
 * `MonitorKind` detection for every watch type, `eventKey` dedupe with `keep`
 * re-arm, AI analysis through `@diggy/core`, and pluggable source / notifier /
 * avatar-alert boundaries so the same engine runs in the MV3 service worker,
 * the server-side crawler scheduler and Vitest.
 *
 * // INTERFACE FOR INTEGRATION — exported surface (repeat, keep in sync):
 * //
 * //   // contracts (re-exported from @diggy/shared)
 * //   import type { MonitorKind, WatchSpec, MonitorEvent, MonitorAPI } from "@diggy/monitor";
 * //
 * //   createMonitorEngine(options: MonitorEngineOptions): MonitorEngine
 * //     // options.source: Source                         (required; network boundary)
 * //     // options.store?: WatchStore                     (default in-memory)
 * //     // options.analyzer?: Analyzer                    (default createCoreAnalyzer())
 * //     // options.notifier?: Notifier                    (default noop)
 * //     // options.avatar?: AvatarAlerter                 (default noop)
 * //     // options.now?, options.idFactory?
 * //   // MonitorEngine = MonitorAPI + { checkAll(), rearm(id), due(now), store }
 * //   //   add(spec) / remove(id) / list() / check(id) / onChange(handler)
 * //
 * //   createWatchStore / new WatchStore(persistence?)   // WatchStore
 * //   evaluateWatch(spec, state, snapshot, now): { detection, state, changed }
 * //   createWatchState(): WatchState ; validateSpec(spec) ; hashText(text): string
 * //   makeEventKey(watchId, ...parts): string
 * //
 * //   createCrawlerSource({ baseUrl, token?, fetchImpl?, adapters? }): Source
 * //   createFetchSource({ fetchImpl?, adapters?, timeoutMs? }): Source
 * //   buildSnapshot(input, adapters?): PageSnapshot
 * //
 * //   createCoreAnalyzer(options?): Analyzer ; createHeuristicAnalyzer(): Analyzer
 * //   createChromeNotifier(chrome.notifications, options?): Notifier
 * //   createCompositeNotifier(...notifiers): Notifier ; createMemoryNotifier(): Notifier
 * //   createAvatarAlerter(avatarApi): AvatarAlerter ; createNoopAvatarAlerter()
 * //
 * //   createMonitorScheduler({ engine, tickMs?, now? }): MonitorScheduler
 * //   installAlarmsScheduler(chrome.alarms, { engine, periodInMinutes? }): { scheduler, install }
 * //
 * //   resolveSiteAdapter(url, adapters?): SiteAdapter ; listSiteAdapters()
 */
// `MonitorKind`/`WatchSpec` are re-exported by `./watches.js`; add the rest.
export type { MonitorAPI, MonitorEvent } from "@diggy/shared";

export * from "./watches.js";
export * from "./site-adapters.js";
export * from "./analyzer.js";
export * from "./source.js";
export * from "./notify.js";
export * from "./avatar-alert.js";
export * from "./scheduler.js";
export * from "./engine.js";
