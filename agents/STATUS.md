# Agent Status Board

Run: `run_93991e284a68` — objective: build DIGGY 2.0 (Personal AI Browser Companion, Monitor Engine USP).
Project: `C:\Users\Ayush\orca\projects\DIGGY 2.O` — pnpm + Turborepo monorepo.
Coordinator: Command Code leader session (Orca). Wave mode: wave-by-wave (Command Code plan credit-bound).

## Workers

| Worker | Engine | Branch | State |
|---|---|---|---|
| core | cmdc | `core` | **merged** |
| brain | cmdc | `brain` | **merged** |
| avatar | cmdc | `avatar` | **merged** |
| ui | cmdc | `ui` | **merged** |
| monitor | cmdc | `monitor` | **merged** |
| actions | cmdc | `actions` | **merged** |
| forms-vault | cmdc | `forms-vault` | **merged** |
| voice | cmdc | `voice` | **merged (code) — needs core wiring** |
| integrations | opencode | `integrations` | queued (wave 4) |
| activity | opencode | `activity` | queued (wave 4) |
| qa | cmdc | `qa` | **wave 4 — e2e + evals + CI landed (this branch)** |

Worktrees live at `C:\Users\Ayush\orca\workspaces\DIGGY 2.O\<name>`.

## Merged so far (waves 1–3)

- **core** — WXT 0.19 MV3 extension scaffold (`apps/extension` → `.output/chrome-mv3`), entrypoints
  `{background,content,sidepanel,offscreen,overlay,settings}`, manifest with `<all_urls>` optional-only,
  plus `@diggy/shared` (`createBus`, typed storage, contracts, tokens).
- **brain** — `@diggy/core`: OpenAI-compatible provider client (chat, tool-calls, SSE, Whisper),
  `FailoverRegistry` (Groq → NVIDIA NIM: ordered chain, backoff retry, health gating, latency/cost),
  orchestrator (plan-act-observe, budget 130/195 + Continue), prompt layering, memory/compaction, skills.
- **avatar** — `@diggy/avatar`: FBXLoader + AnimationMixer, 12-state machine, app.js expression presets,
  capability report, framing, procedural layer, headless controller, R3F `FbxAvatar` + VRM fallback,
  bottom-right mount + status line. Assets in `assets/avatar/` (Chiori.fbx + 8 clips + 4 textures + VRM).
- **ui** — `@diggy/ui`: pastel+gold design system from the theme PNG, primitives, Icon set, golden-D
  `DiggyLogo`, `StatusBubble`, the 7-tab `Dashboard`, CommandPalette (Alt+K), pop-out (Alt+Space),
  status queue; `apps/demo` gallery + overlay lab.
- **monitor** — `@diggy/monitor`: watch specs with baseline + eventKey dedupe, change/keyword/new-post/
  registration/deadline/price detection, AI analysis, notify + avatar alert, scheduler, site adapters;
  `services/crawler`: Crawlee + Playwright + Readability, Jina, experimental Firecrawl/Crawl4AI/
  browser-use adapters, dockerized Python extractor.
- **actions** — `@diggy/page-agent` (a11y snapshot, tool registry → `ActionResult`, plan-before-act,
  playbooks) + `@diggy/policy` (never auto-submit, irreversible approval, sensitive-site blocklist,
  prompt-injection defense).
- **forms-vault** — `@diggy/vault` (Argon2id + AES-GCM + IndexedDB, `tokenFor`/`resolveLocal`) +
  `@diggy/forms` (detect→classify→match→preview→approve→fill, never submit) + extension field-mapper.
- **voice** — `@diggy/voice` (PTT core, STT/TTS via the provider layer, lip-sync feed, status messages)
  + extension offscreen recorder. **Code complete but needs core-owned wiring (see follow-ups).**

## Gates (current main)

`pnpm -w typecheck` 18 tasks ✅ · `pnpm -w test` **521 tests** across 11 packages ✅ ·
`pnpm -w build` 13 tasks ✅ · `pnpm --filter @diggy/extension build` ✅ · `pnpm --filter @diggy/demo build` ✅.

**Important:** run tests with `NODE_ENV=development` — this machine exports `NODE_ENV=production`, which
makes React resolve to its production build and breaks `@diggy/ui`'s `Dashboard.dom.test.tsx` (`act()`).

## Follow-ups for the hardening wave (mostly core-owned)

1. **Voice activation (highest priority).** Voice is built and unit-tested but inert until core:
   - `apps/extension/wxt.config.ts`: declare `commands["toggle-voice"].suggested_key.default = "Ctrl+Space"`.
   - `apps/extension/entrypoints/background.ts`: instantiate `VoiceSession` (recorder channel → offscreen,
     `createTranscriber(provider)` → Groq `whisper-large-v3`), call `bindPushToTalk(...)`, forward
     `OFFSCREEN.silence` → `session.onSilence` and `OFFSCREEN.level` → `attachLipSync`. Key stays server-side.
   - `apps/extension/package.json`: add `"@diggy/voice": "workspace:*"`.
2. **`@diggy/shared/service-auth` missing** — `services/crawler/src/service-auth.ts` is a
   `// TEMP STUB — blocked on core`; promote to the shared contract (`services/api` will need it too).
3. **`@diggy/ui` not declared** in `apps/extension/package.json` (core-owned); sidepanel/overlay use
   relative imports. Add `"@diggy/ui": "workspace:*"`.
4. **Avatar not mounted in the extension** — Home hero / Assistant use the golden-D mark as a
   `// TEMP STUB — blocked on avatar`; mount `<Avatar assetBase="assets/avatar" />`.
5. **`CoreChatMessage` stub** in `packages/core/src/providers/http.ts` is now redundant
   (`ChatMessage.toolCalls` was added to the shared contract) — drop it.
6. **Capability report** ships 8 clip FBX (+ `Chiori.fbx` = 9 FBX); the brief's "9 clips" was off by one.
7. **Not browser-verified**: FBX render (no headless WebGL), no pixel diff vs the theme PNG, and the
   CTRL+SPACE round-trip (needs follow-up 1). jsdom + SSR mount used as the automated substitute.

## Spawn recipe (validated)

1. `orca worktree create --name <name> --base-branch main --json`
2. `orca terminal create --worktree name:<name> --command "cmdc --yolo --trust --skip-onboarding" --title <name> --json`
   (`--yolo --trust` is mandatory: bare `cmdc` stalls on folder-trust and per-tool approval prompts.)
3. `orca terminal send --terminal <handle> --text "<spec>" --enter --json` (Command Code cannot report
   delivery — inspect with `orca terminal read`).

## Verification layer (qa, wave 4)

- **`e2e/`** (`@diggy/e2e`) — Playwright harness loading `.output/chrome-mv3` unpacked. Extension
  loads + side panel/overlay/settings render (browser); **confirm gate** on a real `@diggy/forms`
  fill over a submit-counting fixture, with a control submit proving the gate is real; injection on a
  real page; sensitive-site + irreversible-approval policy; monitor baseline→change→dedupe. Runs
  `tsx run.mjs`; browser tests skip cleanly without a Chromium, the Node gate tests always run.
- **`evals/`** (`@diggy/evals`) — ported seed eval harness (30 tasks + golden recordings), offline
  recorded mode + scorer selftest.
- **`.github/workflows/ci.yml`** — Node 22.13 + pnpm 9.15.9 + `NODE_ENV=development` →
  typecheck + test + build + extension build + evals + Playwright e2e.
- **`e2e/scripts/gate.mjs`** — per-phase gates (PLAN.md phases 0–4), each ending in the core gate.
- **`e2e/REVIEW_CHECKLIST.md`** — merge review checklist applied to every `worker_done`.

Gates on this branch: `pnpm -w typecheck` 21 ✅ · `pnpm -w test` 21 ✅ (e2e 9/9, evals 30/30 + selftest)
· `pnpm -w build` 13 ✅ · `pnpm --filter @diggy/extension build` ✅ · `pnpm --filter @diggy/e2e test` 9/9 ✅.

Note: two workspace globs were added to `pnpm-workspace.yaml` (`e2e`, `evals`) so the acceptance
commands `pnpm --filter @diggy/e2e test` / `pnpm --filter @diggy/evals test` resolve; the lockfile was
regenerated with `NODE_ENV=development pnpm install`. Integration edit — leader to confirm.

## Merge notes

Branch merges conflict on `agents/STATUS.md` (each worker edits it) and `pnpm-lock.yaml`. Resolve by
taking `--ours` for both, then `pnpm install --no-frozen-lockfile` to regenerate the lockfile.
