# w5-monitor — monitor + activity runtime (extension factories)

Read `agents/wave5/README.md` first (conventions + the two frozen interfaces).

## Target

Three new files under `apps/extension/src/`: `watch-persistence.ts`, `monitor-runtime.ts`,
`activity-runtime.ts`.

Read these first and use their **real exported APIs** — do not reimplement any of it:
- `packages/monitor/src/{index,watches,engine,scheduler,notify,avatar-alert,analyzer,source}.ts`
- `packages/activity/src/{index,store,bridge}.ts`
- `apps/extension/src/provider-settings.ts` (the chrome.storage idiom)
- `apps/extension/entrypoints/background.ts` — read only, do not edit; it shows how
  `browser.alarms`, `browser.notifications` and `toTab()` are already used.

## Change

**1. `watch-persistence.ts`**
`createChromeWatchPersistence(): WatchPersistence` over `browser.storage.local` key
`diggy:watches-v2`, persisting the monitor's own `WatchRecord[]` shape so
`WatchStore`'s persistence contract is satisfied. Round-trips (save → load).

**2. `monitor-runtime.ts`** — exactly this factory (the coordinator calls it from `background.ts`):

```ts
export interface MonitorRuntime {
  engine: MonitorEngine;
  install(): void;
  list(): WatchRecord[];
  add(input: { url: string; kind?: MonitorKind; intervalSec?: number; keep?: boolean }): WatchRecord;
  remove(id: string): boolean;
  check(id: string): Promise<MonitorEvent[]>;
}
export function createMonitorRuntime(options: {
  source?: MonitorSource;
  avatar: AvatarAPI;
  activity?: ActivityAPI;
  registry?: BrainModel;
  now?: () => number;
}): MonitorRuntime;
```

Wiring, using the packages' real functions:
- engine: `createMonitorEngine({ source, analyzer, notifier, avatar, persistence })` — check the
  exact option names in `packages/monitor/src/engine.ts` and match them.
- `install()`: `installAlarmsScheduler(browser.alarms, { engine, periodInMinutes: 1 }).install()`
  (alarm name comes from the package's `MONITOR_ALARM`). Also kick a first `engine.checkAll()`
  opportunity — but only through the scheduler, not a `setInterval`.
- `source`: the caller's, else `createFetchSource()`.
- `notifier`: `createCompositeNotifier(createChromeNotifier(browser.notifications, { iconUrl: 'icon/128.png' }), activityNotifier)`
  where `activityNotifier` records an `ActivityEvent` (kind `monitored`, or `alert` for a
  high/critical severity) via the injected `activity`.
- `avatar`: `createAvatarAlerter(options.avatar)`.
- `analyzer`: `createCoreAnalyzer({ registry })` when a registry is supplied, else
  `createHeuristicAnalyzer()`. Read `analyzer.ts` for the real option/return shapes.
- `add` defaults: `kind: 'content_change'`, `intervalSec: 900`, `keep: true`.

**3. `activity-runtime.ts`** — exactly:

```ts
export interface ActivityRuntime {
  record(event: Omit<ActivityEvent, 'id' | 'at'> & { at?: number }): ActivityEvent;
  list(options?: { since?: number; limit?: number }): Promise<ActivityEvent[]>;
  onRecord(handler: (event: ActivityEvent) => void): () => void;
}
export function createActivityRuntime(bus: MessageBus): ActivityRuntime;
```

Built on the package's real `createActivityLog()` + `wireActivityBus(bus, log)`. `record`
delegates to the log (which already redacts); `list`/`onRecord` delegate to the log's methods.

## Constraints

- Do **not** import `./agent-runtime`, `./agent-tools` or `entrypoints/background.ts` — these
  modules are leaves the background composes.
- Do **not** edit `packages/monitor/**` or `packages/activity/**`. If something you need is
  genuinely missing, report it in `worker_done` instead of editing them.
- Do **not** touch `entrypoints/**` or `packages/ui/**`.
- Guard every `browser.*` access (e.g. behind a small accessor) so the module still *imports*
  under a plain node test. Behaviour under a real extension is what matters; importability is
  the bar.
- No `setInterval`. Scheduling is `chrome.alarms` only (an MV3 service worker is evicted).
- TypeScript strict, no `any`, no new dependency.

## Ownership

Yours: `apps/extension/src/watch-persistence.ts`, `apps/extension/src/monitor-runtime.ts`,
`apps/extension/src/activity-runtime.ts`.
Nothing else.

## Observable acceptance

Run and report the exact output of:

```
pnpm -w typecheck
$env:NODE_ENV="production"; pnpm --filter @diggy/extension build
```

Both must be clean. `worker_done` must paste the final exported signature of all three
factories verbatim (the coordinator wires them and must not guess).
