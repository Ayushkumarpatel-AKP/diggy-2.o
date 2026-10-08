# Agent Status Board

Run: `run_93991e284a68` — objective: build DIGGY 2.0 (Personal AI Browser Companion, Monitor Engine USP).
Coordinator handle: `term_236d2216-c43b-462a-8c9e-4e147b5f76e0`.
Project: `C:\Users\Ayush\orca\projects\DIGGY 2.O` (base `main`, Phase 0 @ `19afff6`).

## Live workers

| Worker | Worktree / branch | Terminal (handle) | Brief | State |
|---|---|---|---|---|
| core | `orca/workspaces/DIGGY 2.O/core` / `core` | `term_dcb55797-9e71-4bfa-b46f-620fb178d026` | `agents/core.md` | **done** — merged to `main` |
| avatar | `orca/workspaces/DIGGY 2.O/avatar` / `avatar` | `term_d0795e6e-e881-4d4a-adfc-249fdc8dba31` | `agents/avatar.md` | running (wave 2) |
| brain | `orca/workspaces/DIGGY 2.O/brain` / `brain` | `term_86cc3e83-e399-4d2c-8a17-044e817e18de` | `agents/brain.md` | **done** — merged to `main` |
| ui | `orca/workspaces/DIGGY 2.O/ui` / `ui` | `term_518302c6-4319-46bc-b4d5-57f01866d000` | `agents/ui.md` | running (wave 2) |
| monitor | `DIGGY 2.O/monitor` / `monitor` | — | `agents/monitor.md` | queued (wave 3) |
| actions | `DIGGY 2.O/actions` / `actions` | — | `agents/actions.md` | queued (wave 3) |
| forms-vault | `DIGGY 2.O/forms-vault` / `forms-vault` | — | `agents/forms-vault.md` | queued (wave 3) |
| voice | `DIGGY 2.O/voice` / `voice` | — | `agents/voice.md` | queued (wave 3) |
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

### brain (branch `brain`) — ✅ done

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
