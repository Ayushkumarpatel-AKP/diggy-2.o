# w5-reminders — reminder engine

Read `agents/wave5/README.md` first (conventions + the frozen interface).

## Target

New workspace package `packages/reminders`. Mirror the structure and conventions of
`packages/monitor` — read `packages/monitor/src/{watches,engine,scheduler,index}.ts` and
`packages/monitor/package.json` before writing anything, and follow them closely.

## Change

A host-agnostic, one-shot reminder engine. Deliver these files:

- `package.json` — same script set as `packages/monitor` (`typecheck`, `build`, `test`, `clean`);
  dependencies on `@diggy/shared` only (`workspace:*`); jsdom + vitest + typescript + rimraf as dev.
- `tsconfig.json` + `tsconfig.build.json` — copy `packages/monitor`'s and adjust paths.
- `vitest.config.ts` — copy `packages/monitor`'s if it has one; reminders need no DOM.
- `src/types.ts` — `Reminder`, `ReminderInput`, `ReminderPersistence`, `ReminderEvent`,
  `ReminderEventKind`, `ReminderNotifier`, `ReminderAvatar` (see the frozen interface in the wave README).
- `src/store.ts` — `ReminderStore` + `MemoryReminderPersistence`.
- `src/schedule.ts` — `REMINDER_ALARM_PREFIX`, `reminderAlarmName`, `isReminderAlarm`,
  `reminderIdFromAlarm`, and `nextDueAt(reminders, now)`.
- `src/engine.ts` — `createReminderEngine`, `createNoopReminderNotifier`, `createNoopReminderAvatar`.
- `src/index.ts` — the package barrel.
- `test/*.test.ts`.

Also deliver `apps/extension/src/reminder-persistence.ts`:
`createChromeReminderPersistence(): ReminderPersistence` over `browser.storage.local` key
`diggy:reminders`, storing the `Reminder[]` array. Model it on
`apps/extension/src/provider-settings.ts`'s storage usage style.

## Constraints

- **No `chrome`/`browser` import in `packages/reminders`.** The extension supplies the adapter.
- **No DOM.** These tests run in node.
- `dueAt` is an absolute epoch-ms number. A `dueAt` at or before `now` must be **rejected** by
  `ReminderStore.add` with a thrown `Error` whose message contains `past` — the core system
  prompt already tells the model never to set a past reminder; this is the hard guard.
- **One-shot.** `fireDue(now)` fires each reminder **at most once** and stamps `firedAt`.
  Calling it twice with the same `now` returns one event the first time and none the second.
  `done` and `firedAt` are distinct: fired ≠ completed.
- `due(now)` returns only reminders that are not `done` and not yet `firedAt` and whose
  `dueAt <= now`.
- `add` must cap the list (use `MAX_REMINDERS = 100`) and assign ids like `rem-<n>` from an
  injectable `idFactory` so tests are deterministic.
- Persistence is injected and **write-through**: a mutation calls `save()`; `load()` is called
  once (the store exposes it) and rehydrates.
- No explanatory comments on self-evident code; match `packages/monitor`'s comment density.

## Ownership

Yours: `packages/reminders/**` and `apps/extension/src/reminder-persistence.ts`.
Do **not** touch: `apps/extension/entrypoints/**`, any other package, `turbo.json`,
`pnpm-workspace.yaml` (it already globs `packages/*`), `pnpm-lock.yaml`.

## Observable acceptance

Run and report the exact output of:

```
pnpm install --no-frozen-lockfile     # only if a new workspace package needs linking
pnpm --filter @diggy/reminders typecheck
pnpm --filter @diggy/reminders test
```

Tests must cover: add/list/get/remove/complete; `due()` filtering; **`fireDue` idempotency**;
past-`dueAt` rejection; the alarm-name round-trip; `nextDueAt`; and a persistence round-trip
through `MemoryReminderPersistence` (and the chrome adapter's shape, if you can test it
without a browser — skip it if not, and say so).
