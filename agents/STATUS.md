# Agent Status Board

Run: `run_93991e284a68` — objective: build DIGGY 2.0 (Personal AI Browser Companion, Monitor Engine USP).
Coordinator handle: `term_236d2216-c43b-462a-8c9e-4e147b5f76e0`.
Project: `C:\Users\Ayush\orca\projects\DIGGY 2.O` (base `main`, Phase 0 @ `19afff6`).

## Live workers

| Worker | Worktree / branch | Terminal (handle) | Brief | State |
|---|---|---|---|---|
| core | `orca/workspaces/DIGGY 2.O/core` / `core` | `term_dcb55797-9e71-4bfa-b46f-620fb178d026` | `agents/core.md` | **done** — merged to `main` |
| avatar | `DIGGY 2.O/avatar` / `avatar` | — | `agents/avatar.md` | **done (unmerged)** — 12-state FBX avatar + VRM fallback |
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

### avatar (branch `avatar`) — ✅ done, unmerged

- **Scope touched**: `packages/avatar/**`, `assets/avatar/**`, `agents/STATUS.md`, `pnpm-lock.yaml`.
  Nothing else. FBX is primary; VRM is the fallback only.
- **Assets**: copied `diggy motion/Chiori.fbx` + the 8 clip FBX + `tex/*` and
  `projects/diggy/assets/avatar/AvatarSample_I.vrm` into `assets/avatar/` (names unchanged).
- **New package `@diggy/avatar`**: `src/state-machine.ts` (12-state machine), `src/expressions.ts`
  (app.js presets ported verbatim), `src/capability.ts` (+ ValveBiped bone aliases), `src/clips.ts`,
  `src/procedural.ts`, `src/framing.ts` (`frameFbx` port), `src/controller.ts` (headless `AvatarAPI`),
  `src/FbxAvatar.tsx` (R3F + `FBXLoader` + `AnimationMixer`, 30 FPS cap, hidden-tab pause),
  `src/VrmAvatar.tsx` (three-vrm fallback), `src/index.tsx` (bottom-right mount, pointer-events only
  on the avatar, 💭 status line). 6 test files.
- **Capability report for `Chiori.fbx`** (parsed offline): 122 bones (ValveBiped naming), 1 skinned
  mesh, **30,126 triangles** (0.4% over the 30k target → report emits a budget warning), 19 morph
  targets (`Smile…`, `Blink`, `Angry`, `Confused`, `Sleepy` via `Sad*`, etc.). All 8 clips load
  (durations 1.1–8.87s, 67 tracks each); 65/66 track targets bind to base bones (the 66th is the
  `Chiori_ARM` root node, also present); every clip animates the head, so gaze layering is safe.
- **Gates**: `pnpm -w typecheck` ✅ · `pnpm -w test` ✅ (41 avatar tests + 9 shared) · `pnpm -w build`
  ✅ · `pnpm --filter @diggy/extension build` ✅. Tests prove all 12 states map, priority/auto-return,
  0.2–0.35s cross-fades, and that missing clips/bones/morphs degrade without throwing.
- **Notes / follow-ups**: brief says "9 clips"; disk ships 8 (+`Chiori.fbx` = 9 FBX total). Avatar is
  not yet wired into `apps/extension` (UI worker owns that); consume via
  `<Avatar assetBase="/assets/avatar" />`. `@pixiv/three-vrm` transitive types are duck-typed locally
  because its extensionless cross-package re-exports do not resolve under `NodeNext`.

