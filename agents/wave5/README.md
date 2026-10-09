# Wave 5 — Natural-Language Agent Runtime

Four workers, each owning a disjoint file set, plus the coordinator on the shared core.

**Read the approved plan first:** `C:\Users\Ayush\.commandcode\plans\diggy-nl-agent-runtime.md`
(repo copy: `agents/PLAN.md` is the older roster — the plan above supersedes it for this wave).

## Why worktrees

Four agents edit the same pnpm monorepo concurrently. Each gets its own Orca worktree so
there is no shared checkout conflict; the coordinator merges file sets, which are disjoint
by construction.

## Ownership map

| Worker | Owns | Does not touch |
|---|---|---|
| **coordinator** (orchestrating session) | `packages/core/src/orchestrator.ts`, `packages/page-agent/src/{tool-adapter,tool-host,user-submit}.ts`, `apps/extension/src/{agent-runtime,agent-tools,agent-progress,page-tools,provider-settings}.ts`, `apps/extension/entrypoints/{background,content}.ts`, `apps/extension/entrypoints/sidepanel/main.tsx`, `packages/ui/src/index.ts` | anything else |
| **w5-reminders** | `packages/reminders/**`, `apps/extension/src/reminder-persistence.ts` | `entrypoints/**`, any other package |
| **w5-ui** | `packages/ui/**` | `apps/**` |
| **w5-google** | `apps/extension/src/google.ts`, `apps/extension/src/accounts.ts`, `apps/extension/entrypoints/settings/main.tsx`, `apps/extension/wxt.config.ts` | `entrypoints/background.ts` |
| **w5-monitor** | `apps/extension/src/{watch-persistence,monitor-runtime,activity-runtime}.ts` | `entrypoints/**`, `packages/monitor/**`, `packages/activity/**`, `packages/ui/**` |

## Shared conventions (all workers)

- ESM, `type: module`, relative imports carry the `.js` extension.
- TypeScript strict; no `any`; `export type` for type-only re-exports.
- Tests are vitest, in `test/*.test.ts` (packages) — run them, don't just write them.
- **No `chrome`/`browser` global outside `apps/extension`.** Packages stay host-agnostic and
  take their adapters by injection (that is how `packages/monitor` and `packages/activity` work).
- No new dependencies unless the brief says so.
- Match the surrounding code's style; do not add explanatory comments to code you didn't change.
- Gates on this machine: `TURBO_CONCURRENCY=2` (5.9 GB RAM), and
  `NODE_ENV=production` for any extension build (a `development` build compiles JSX to
  `jsxDEV` and crashes in the browser).

## Frozen interfaces the coordinator depends on

```ts
// packages/reminders — w5-reminders owns these exact shapes
export interface Reminder {
  id: string; title: string; dueAt: number; notes?: string; command?: string;
  done: boolean; createdAt: number; firedAt?: number;
}
export interface ReminderInput { title: string; dueAt: number; notes?: string; command?: string }
export interface ReminderPersistence {
  load(): Promise<Reminder[]> | Reminder[];
  save(reminders: readonly Reminder[]): Promise<void> | void;
}
export type ReminderEventKind = 'created' | 'fired' | 'removed' | 'completed';
export interface ReminderEvent { kind: ReminderEventKind; reminder: Reminder; at: number }
export class ReminderStore { constructor(persistence?: ReminderPersistence, options?: { now?: () => number; idFactory?: () => string }) }
export class MemoryReminderPersistence implements ReminderPersistence {}
export function createReminderEngine(options: {
  store: ReminderStore; notifier?: ReminderNotifier; avatar?: ReminderAvatar;
  onEvent?: (event: ReminderEvent) => void; now?: () => number;
}): ReminderEngine;
export interface ReminderEngine {
  add(input: ReminderInput): Reminder;
  list(): Reminder[];
  remove(id: string): boolean;
  complete(id: string): boolean;
  fireDue(now?: number): Promise<ReminderEvent[]>;
  nextDueAt(now?: number): number | null;
}
export const REMINDER_ALARM_PREFIX = 'diggy:reminder:';
export function reminderAlarmName(id: string): string;
export function isReminderAlarm(name: string): boolean;
export function reminderIdFromAlarm(name: string): string | null;
```

```ts
// apps/extension/src/monitor-runtime.ts — w5-monitor owns these exact shapes
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

```ts
// apps/extension/src/activity-runtime.ts
export interface ActivityRuntime {
  record(event: Omit<ActivityEvent, 'id' | 'at'> & { at?: number }): ActivityEvent;
  list(options?: { since?: number; limit?: number }): Promise<ActivityEvent[]>;
  onRecord(handler: (event: ActivityEvent) => void): () => void;
}
export function createActivityRuntime(bus: MessageBus): ActivityRuntime;
```

## Reporting

Send `worker_done` from your dispatched terminal with `--outcome succeeded|failed`, the exact
commands you ran and their results, and any file you could not touch. If an interface above
turns out to be wrong, say so in `worker_done` rather than silently diverging — the
coordinator will reconcile it.
