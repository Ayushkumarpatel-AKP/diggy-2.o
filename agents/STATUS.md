# Agent Status Board

Run: `run_93991e284a68` — objective: build DIGGY 2.0 (Personal AI Browser Companion, Monitor Engine USP).
Coordinator handle: `term_236d2216-c43b-462a-8c9e-4e147b5f76e0`.
Project: `C:\Users\Ayush\orca\projects\DIGGY 2.O` (base `main`, Phase 0 @ `19afff6`).

## Live workers

| Worker | Worktree / branch | Terminal (handle) | Brief | State |
|---|---|---|---|---|
| core | `orca/workspaces/DIGGY 2.O/core` / `core` | `term_dcb55797-9e71-4bfa-b46f-620fb178d026` | `agents/core.md` | **done** — merged to `main` |
| avatar | `DIGGY 2.O/avatar` / `avatar` | — | `agents/avatar.md` | queued (wave 2) |
| brain | `DIGGY 2.O/brain` / `brain` | — | `agents/brain.md` | queued (wave 2) |
| ui | `DIGGY 2.O/ui` / `ui` | — | `agents/ui.md` | **done** — ready for review |
| monitor | `DIGGY 2.O/monitor` / `monitor` | — | `agents/monitor.md` | queued (wave 3) |
| actions | `DIGGY 2.O/actions` / `actions` | — | `agents/actions.md` | queued (wave 3) |
| forms-vault | `DIGGY 2.O/forms-vault` / `forms-vault` | — | `agents/forms-vault.md` | queued (wave 3) |
| voice | `DIGGY 2.O/voice` / `voice` | — | `agents/voice.md` | queued (wave 3) |
| integrations | `DIGGY 2.O/integrations` / `integrations` | — | `agents/integrations.md` | queued (wave 4) |
| activity | `DIGGY 2.O/activity` / `activity` | — | `agents/activity.md` | queued (wave 4) |
| qa | `DIGGY 2.O/qa` / `qa` | — | `agents/qa.md` | queued (wave 4) |

## Spawn recipe (validated on the core pilot)

1. `orca worktree create --name <name> --base-branch main --json` (or `worker-start --worktree new-child --name <name> --agent command-code`).
2. `orca terminal create --worktree name:<name> --command "cmdc" --title <name> --json`.
3. First-ever Command Code launch shows a **language chooser** — send Enter once (now cached globally).
4. `orca terminal send --terminal <handle> --text "<spec>" --enter --json` (Command Code cannot report delivery — inspect with `terminal read`).

**Constraint observed:** the core worker's Command Code plan reported *83% used, 12.2 credits left*.
Fan-out is wave-by-wave to respect that budget.

## Coordinator monitoring

```
orca orchestration worker-list --include-remote --json
orca orchestration check --wait --types "worker_done,escalation,question" --timeout-ms 900000 --json
orca terminal read --terminal <handle> --limit 45 --json
```

## Integration log

1. On completion: review diff for contract violations, secrets, permission creep, locked-data exposure, auto-submit.
2. Merge one branch at a time into `main`.
3. After each merge: `$env:NODE_ENV="development"; pnpm -w typecheck && pnpm -w test && pnpm -w build`.

### core (branch `core`) — ✅ done, merged

- **Scaffold**: `apps/extension` = WXT 0.19.29 + React 18 + Tailwind 3, MV3, builds to
  `apps/extension/.output/chrome-mv3`. Entrypoints: `background`, `content` (runtime-registered),
  `sidepanel`, `offscreen`, `overlay`, `settings`.
- **Shared** (`packages/shared`): `createBus()` (`src/bus.ts`), typed `createStorage()` +
  `createMemoryStorageArea()` (`src/storage.ts`); real build → `dist`.
- **Storage**: `apps/extension/src/storage.ts` wraps `chrome.storage.local` over the shared typed
  helper + IndexedDB placeholder.
- **Manifest/CSP**: exactly `storage, alarms, notifications, tabs, scripting, sidePanel, offscreen,
  activeTab`; `optional_host_permissions: ["<all_urls>"]`; **no required `host_permissions`** (a
  `build:manifestGenerated` hook strips WXT's auto-added runtime-CS hosts); CSP
  `script-src 'self'; object-src 'self'`; no provider keys in the bundle.
- **Gates**: `pnpm -w typecheck` ✅ · `pnpm -w test` ✅ (9 tests) · `pnpm -w build` ✅ ·
  `pnpm --filter @diggy/extension build` ✅ → `.output/chrome-mv3`.
- **Note for downstream workers**: `pnpm-lock.yaml` changed (`@wxt-dev/module-react` pinned to
  `~1.1.5` — 1.2.x pulls `@vitejs/plugin-react@6`, incompatible with WXT 0.19's Vite 5). Re-run
  `$env:NODE_ENV="development"; pnpm install` after merging.

### ui (branch `ui`) — ✅ done, ready for review

- **`packages/ui`** — pastel + gold design system. `src/styles.css` mirrors `@diggy/shared` `tokens`
  (source of truth: the theme PNG); `src/theme.ts` re-derives the same values as CSS custom properties
  and can re-apply/override them at runtime (`tokenCssVariables()`, `applyTokens()`).
  Primitives: `Panel, Card, MetricTile, Pill, ListRow, AlertRow, Tabs, Button, Input/SearchField,
  AvatarChip, IconButton, QuickAction, StatusBubble` plus an inline `Icon` set (40 icons) and the
  golden-D `DiggyLogo`/`BrowserDots` reproduced as SVG — no raster asset in the extension bundle.
- **`Dashboard`** (`src/app/Dashboard.tsx`) — the 7 tabs from `NAV_TABS` in exact order
  (Home, Assistant, Monitor, Actions, Integrations, Vault, Activity) in the sidebar. Home = greeting
  hero + 4 metric tiles (Websites monitoring / New alerts / Actions completed / Integrations active),
  Recent Alerts, Quick Commands (Track this site · Summarize page · Fill form · Explain page ·
  Analyze repository). Command palette `Alt+K`; detachable panel `Alt+Space` (Document
  Picture-in-Picture with popup fallback, restores the DOM slot on close).
- **`StatusBubble`** — thought/speech styles, priority dot, typewriter reveal, queue-by-priority
  (`useStatusQueue`), collapse to a 💭 chip; consumes the `AvatarAPI.status` contract via an `api` prop.
- **Sidepanel / overlay** — `entrypoints/sidepanel` renders `Dashboard`; `entrypoints/overlay` renders
  `StatusBubble` (converted to a React `main.tsx`). Both reach `packages/ui` by **relative import**:
  `apps/extension/package.json` is core-owned, so `@diggy/ui` was **not** added there. When core next
  touches it, add `"@diggy/ui": "workspace:*"` and the imports become `from "@diggy/ui"`.
- **`apps/demo`** — Vite + React gallery: all 7 tab views (the real `Dashboard`), a component gallery,
  and an overlay/palette lab. `pnpm --filter @diggy/demo dev` → open the printed URL.
- **Gates** — `pnpm -w typecheck` ✅ (6) · `pnpm -w test` ✅ (25 = 9 shared + 16 ui) ·
  `pnpm -w build` ✅ (4) · `pnpm --filter @diggy/extension build` ✅ (sidepanel chunk 73.3 kB,
  styles 20.5 kB) · `pnpm --filter @diggy/demo build` ✅.
- **"No console errors" evidence** — `src/app/Dashboard.dom.test.tsx` mounts the real dashboard in
  jsdom, clicks through all 7 tabs and the palette, and fails on any `console.error`/`console.warn`.
- **Not done / follow-ups** — pixel-level screenshot diff vs the theme PNG (agent-browser not
  installed on this host; SSR + jsdom mount used as the automated substitute). Home hero and Assistant
  use the golden-D mark where the FBX renderer mounts (`// TEMP STUB — blocked on avatar`).
