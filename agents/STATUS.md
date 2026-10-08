# Agent Status Board

Run: `run_93991e284a68` — objective: build DIGGY 2.0 (Personal AI Browser Companion, Monitor Engine USP).
Coordinator handle: `term_236d2216-c43b-462a-8c9e-4e147b5f76e0`.
Project: `C:\Users\Ayush\orca\projects\DIGGY 2.O` (base `main`, Phase 0 @ `19afff6`).

## Live workers

| Worker | Worktree / branch | Terminal (handle) | Brief | State |
|---|---|---|---|---|
| core | `orca/workspaces/DIGGY 2.O/core` / `core` | `term_dcb55797-9e71-4bfa-b46f-620fb178d026` | `agents/core.md` | **done** — merged to `main` |
| avatar | `orca/workspaces/DIGGY 2.O/avatar` / `avatar` | `term_d0795e6e-e881-4d4a-adfc-249fdc8dba31` | `agents/avatar.md` | **done** — merged to `main` |
| brain | `orca/workspaces/DIGGY 2.O/brain` / `brain` | `term_86cc3e83-e399-4d2c-8a17-044e817e18de` | `agents/brain.md` | **done** — merged to `main` |
| ui | `orca/workspaces/DIGGY 2.O/ui` / `ui` | `term_518302c6-4319-46bc-b4d5-57f01866d000` | `agents/ui.md` | **done** — merged to `main` |
| monitor | `orca/workspaces/DIGGY 2.O/monitor` / `monitor` | `term_6899c8cc-06dd-4a51-ab5b-9d8fb4ef1703` | `agents/monitor.md` | running (wave 3) |
| actions | `orca/workspaces/DIGGY 2.O/actions` / `actions` | `term_e92827ea-41d2-450f-a062-3304a8e4f8bf` | `agents/actions.md` | running (wave 3) |
| forms-vault | `orca/workspaces/DIGGY 2.O/forms-vault` / `forms-vault` | `term_c7e07d17-7c91-49f4-84b6-8340db7331a2` | `agents/forms-vault.md` | running (wave 3) |
| voice | `orca/workspaces/DIGGY 2.O/voice` / `voice` | `term_3d406e2c-2603-4eb7-b91d-720bebc2df05` | `agents/voice.md` | running (wave 3) |
| integrations | `DIGGY 2.O/integrations` / `integrations` | — | `agents/integrations.md` | queued (wave 4) |
| activity | `DIGGY 2.O/activity` / `activity` | — | `agents/activity.md` | queued (wave 4) |
| qa | `DIGGY 2.O/qa` / `qa` | — | `agents/qa.md` | queued (wave 4) |

## Spawn recipe (validated on the core pilot)

1. `orca worktree create --name <name> --base-branch main --json` (or `worker-start --worktree new-child --name <name> --agent command-code`).
2. `orca terminal create --worktree name:<name> --command "cmdc --yolo --trust --skip-onboarding" --title <name> --json`.
   - **Must pass `--yolo --trust`**: a bare `cmdc` prompts for folder trust + every tool ("needs to run powershell"),
     which stalls a supervised worker. `--yolo` gives "permission bypass on"; `--trust` skips the per-worktree trust gate.
3. If a bare `cmdc` ever shows a **language chooser** / **"Do you trust the files in this folder?"**, send Enter (one-time).
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

### brain (branch `brain`) — ✅ done, merged

- **New package** `packages/core` (`@diggy/core`) implementing the `Provider` / `ProviderRegistry`
  contracts from `packages/shared/src/contracts/provider.ts` (its own `Provider`, not the AI SDK).
- **Deliverables (all done):**
  1. `providers/{http,groq,nvidia-nim,index}.ts` — shared OpenAI-compatible client (chat, tool-calls,
     SSE stream, Whisper transcribe, health); Groq `openai/gpt-oss-120b` + STT `whisper-large-v3`,
     NVIDIA NIM `openai/gpt-oss-20b`.
  2. `registry.ts` — `FailoverRegistry implements ProviderRegistry`: ordered chain, auto-switch on
     failure, exponential-backoff retry, health gating, latency + cost accounting.
  3. `orchestrator.ts` — plan → act → observe → repeat; step budget default **130**, hard cap **195**;
     `Continue` signal + resumable checkpoint.
  4. `prompt.ts` — DIGGY persona + `extend`/`override` layering; temps **0.15 / 0.3 / 0** for
     browser-control / ask / vision.
  5. `memory/` — per-tab history, user memory (stated preferences), token-aware compaction with
     tool-result limits + overflow recovery.
  6. `skills.ts` — on-demand agentskills.io-style loader.
  7. `providers/registry-catalog.ts` — model-agnostic catalog (openai/openrouter available now;
     anthropic/gemini are one-file-each `planned` slots).
- **Gates:** `pnpm -w typecheck` ✅ (4 tasks) · `pnpm -w test` ✅ (**58 tests**: shared 9 + core 49) ·
  `pnpm -w build` ✅ (core `dist` + `apps/extension/.output/chrome-mv3`).
- **Failover proof:** `src/registry.test.ts` — Groq down (3 attempts = 1 + 2 retries, backoff
  250→500 ms) → NVIDIA answers; `chatWithProvider().provider.id === "nvidia-nim"`, and `chat()`
  returns a plain `ChatResult`, so the switch is invisible to callers.
- **Contract gap — RESOLVED by leader:** `ChatMessage.toolCalls?: ToolCall[]` added to
  `packages/shared/src/contracts/provider.ts` (commit `a5309f4`). The `CoreChatMessage` stub in
  `providers/http.ts` is now redundant but remains valid; drop it during the hardening wave.
- **Note:** `pnpm-lock.yaml` changed (new `@diggy/core` importer). Re-run
  `$env:NODE_ENV="development"; pnpm install` after merging.

### avatar (branch `avatar`) — ✅ done, merged

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

### ui (branch `ui`) — ✅ done, merged

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
