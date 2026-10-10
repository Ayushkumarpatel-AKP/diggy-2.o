# w8-screens — API Keys nav, Monitor controls, Actions data, the richer bubble

Read `agents/wave8/README.md` first (frozen interfaces are there).

## Target

`packages/shared/src/contracts/nav.ts`, `packages/ui/src/Icon.tsx`,
`packages/ui/src/app/Dashboard.tsx`, `packages/ui/src/app/screens/*.tsx`,
`packages/ui/src/primitives/StatusBubble.tsx`,
`packages/ui/src/hooks/{statusQueue,useStatusQueue}.ts`, `packages/ui/src/index.ts`.

You own `nav.ts` and `index.ts` for this wave.

## Change

**1. An `API Keys` nav item** (`packages/shared/src/contracts/nav.ts`): add
`{ id: "apikeys", label: "API Keys", icon: <an existing icon> }` to `NAV_TABS`. The sidebar and the
tab strip both map over `NAV_TABS`, so they pick it up automatically — but these hard-code
"exactly 7" and **will fail/not compile** until updated:
- `packages/ui/src/app/Dashboard.test.tsx` — the exact-count assertion **and** the exhaustive
  `MARKER: Record<NavTabId, string>` record
- `packages/ui/src/app/Dashboard.dom.test.tsx` — the same `MARKER` record
- `e2e/tests/02-sidepanel.mjs` — `EXPECTED_TABS`

Then add a render branch in `Dashboard.tsx` (the screen chain is a run of `activeTab === "..." ?`
ternaries) pointing at a new `packages/ui/src/app/screens/ApiKeysScreen.tsx`. The screen is a thin
presentational wrapper that renders the existing `SetupPanel` (`packages/ui/src/app/SetupPanel.tsx`
— read it first) with props passed through from `Dashboard`. Every field on it must already work;
the screen adds nothing new. No `chrome` in the screen.

**2. Monitor controls** (`MonitorScreen.tsx`): the screen has no start/stop/refresh/delete and its
GitHub/Others tabs hard-code an empty list. Add, sending intents the coordinator is implementing:
- the header button → `onCommand("Add Website", "watch.add")`
- the per-row three-dot → a `Menu` (from w8-parts) with **Check now** (`watch.check:<id>`),
  **Pause** / **Resume** (`watch.pause:<id>` / `watch.resume:<id>`), **Remove** (`watch.remove:<id>`, `danger`)
- the per-row bell → `onCommand(label, "watch.notify:<id>")`
- the tabs must filter the real `watches` by kind, not return `[]`

**3. `ActionsScreen` needs data.** Add an `actions?: ActionLogRow[]` prop (default `[]`), and have
`Dashboard` forward it. Wire "New Action" and the per-row three-dot to real intents. Keep the
existing empty state, and make it explain what will appear here.

**4. `ActivityScreen`'s range selector** is a `<button>` styled as a dropdown that only pushes a
status line. Replace it with the real `Menu` filtering the events, or make it actually filter.

**5. The bubble must fit an approval.** In `useStatusQueue` / `statusQueue.ts`, `truncateStatus`
clips to **68 chars**, which is too short for a status line describing an action. Raise the cap for
`liveStatus`-style messages (or add a long-form variant) — and make sure a `pendingConfirmation` can
render **alongside** the status dock rather than replacing it (`Dashboard.tsx` currently renders one
or the other). `StatusBubble` should also render an `ActionCard` (w8-parts) when the confirmation
carries `kind`/`targetUrl`/`thumbnailUrl`.

## Constraints

- Additive: no existing export renamed or removed; no existing prop made required.
- `packages/ui` stays browser-agnostic. No new dependency.
- The 36 existing ui tests must pass, updated where the count changed.

## Observable acceptance

```
pnpm --filter @diggy/ui typecheck
pnpm --filter @diggy/ui test
pnpm --filter @diggy/ui build
```

All clean. `worker_done` must list every intent string you emit, and every file you changed.
