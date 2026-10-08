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
| ui | `DIGGY 2.O/ui` / `ui` | — | `agents/ui.md` | queued (wave 2) |
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
