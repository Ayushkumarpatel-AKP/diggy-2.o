# Agent Status Board

Run objective: build DIGGY 2.0 (Personal AI Browser Companion) with the Monitor Engine as the USP.
Coordinator: this Command Code session in `C:\Users\Ayush\orca\projects\DIGGY 2.O`.
Leader run id / coordinator handle: _(filled in when the Orca Run is created)_.

## Live workers

| Worker | Worktree / branch | Terminal / Dispatch | Brief | State |
|---|---|---|---|---|
| core | `DIGGY 2.O/core` / `core` | plain terminal | `agents/core.md` | ✅ done — gates green (see log) |
| avatar | `DIGGY 2.O/avatar` / `agent/avatar` | _pending_ | `agents/avatar.md` | blocked on core (contracts) |
| brain | `DIGGY 2.O/brain` / `agent/brain` | _pending_ | `agents/brain.md` | blocked on core |
| monitor | `DIGGY 2.O/monitor` / `agent/monitor` | _pending_ | `agents/monitor.md` | queued |
| actions | `DIGGY 2.O/actions` / `agent/actions` | _pending_ | `agents/actions.md` | queued |
| ui | `DIGGY 2.O/ui` / `agent/ui` | _pending_ | `agents/ui.md` | blocked on core |
| forms-vault | `DIGGY 2.O/forms-vault` / `agent/forms-vault` | _pending_ | `agents/forms-vault.md` | queued |
| integrations | `DIGGY 2.O/integrations` / `agent/integrations` | _pending_ | `agents/integrations.md` | queued |
| voice | `DIGGY 2.O/voice` / `agent/voice` | _pending_ | `agents/voice.md` | queued |
| activity | `DIGGY 2.O/activity` / `agent/activity` | _pending_ | `agents/activity.md` | queued |
| qa | `DIGGY 2.O/qa` / `agent/qa` | _pending_ | `agents/qa.md` | queued |

## Coordinator monitoring

```
orca orchestration worker-list --include-remote --json
orca orchestration check --wait --types "worker_done,escalation,question" --timeout-ms 900000 --json
orca orchestration worker-read --dispatch <dispatch_id> --limit 50 --json
```

## Integration log

1. On `worker_done`: review diff for contract violations, secrets, permission creep, locked-data
   exposure, anything that could auto-submit.
2. Merge `agent/<name>` one branch at a time into `main`.
3. After each merge: `pnpm -w typecheck && pnpm -w test && pnpm -w build`.

### core (branch `core`) — ✅ done

- **Scaffold**: `apps/extension` = WXT 0.19.29 + React 18 + Tailwind 3, MV3, builds to
  `apps/extension/.output/chrome-mv3`. Entrypoints: `background`, `content` (runtime-registered),
  `sidepanel`, `offscreen`, `overlay`, `settings`.
- **Shared** (`packages/shared`): `createBus()` (`src/bus.ts`), typed `createStorage()` +
  `createMemoryStorageArea()` (`src/storage.ts`); real build → `dist` (silences the no-output warning).
- **Storage**: `apps/extension/src/storage.ts` wraps `chrome.storage.local` over the shared typed
  helper + `openDiggyDatabase()` IndexedDB placeholder.
- **Manifest/CSP**: build output has exactly `storage, alarms, notifications, tabs, scripting,
  sidePanel, offscreen, activeTab`; `optional_host_permissions: ["<all_urls>"]`; **no required
  `host_permissions`** (a `build:manifestGenerated` hook strips WXT's auto-added runtime-CS hosts);
  `extension_pages` CSP `script-src 'self'; object-src 'self'`; no provider keys in the bundle.
- **Gates**: `pnpm -w typecheck` ✅ · `pnpm -w test` ✅ (9 tests) · `pnpm -w build` ✅ ·
  `pnpm --filter @diggy/extension build` ✅ → `.output/chrome-mv3`.
- **Note for downstream workers**: `pnpm-lock.yaml` changed (`@wxt-dev/module-react` pinned to `~1.1.5`
  — 1.2.x pulls `@vitejs/plugin-react@6`, incompatible with WXT 0.19's Vite 5). Re-run
  `$env:NODE_ENV="development"; pnpm install` after merging.
