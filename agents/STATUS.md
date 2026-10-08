# Agent Status Board — DIGGY 2.0

Run: `run_93991e284a68` — objective: build DIGGY 2.0 (Personal AI Browser Companion, Monitor Engine USP).
Project: `C:\Users\Ayush\orca\projects\DIGGY 2.O` — pnpm + Turborepo monorepo (TypeScript, MV3).
Coordinator: Command Code leader session (Orca). Mode: wave-by-wave (Command Code plan credit-bound).

## Workers — all merged to `main`

| Worker | Engine | Branch | Deliverable |
|---|---|---|---|
| core | cmdc | `core` | WXT MV3 extension scaffold + `@diggy/shared` |
| brain | cmdc | `brain` | `@diggy/core` provider failover, orchestrator, memory, skills |
| avatar | cmdc | `avatar` | `@diggy/avatar` FBX 12-state machine + VRM fallback |
| ui | cmdc | `ui` | `@diggy/ui` pastel+gold 7-tab dashboard + demo |
| monitor | cmdc | `monitor` | `@diggy/monitor` + `services/crawler` (the USP) |
| actions | cmdc | `actions` | `@diggy/page-agent` + `@diggy/policy` |
| forms-vault | cmdc | `forms-vault` | `@diggy/vault` + `@diggy/forms` |
| voice | cmdc | `voice` | `@diggy/voice` + offscreen recorder + CTRL+SPACE |
| integrations | opencode | `integrations` | `services/api` + `@diggy/service-auth` + extension clients |
| activity | opencode | `activity` | `@diggy/activity` log + redaction + timeline |
| qa | cmdc | `qa` | `e2e/` Playwright harness, `evals/`, CI |

Worktrees: `C:\Users\Ayush\orca\workspaces\DIGGY 2.O\<name>`.

## Layout

`packages/` — shared, core, avatar, ui, monitor, page-agent, policy, vault, forms, voice, activity, service-auth
`apps/` — extension (WXT MV3 → `.output/chrome-mv3`), demo (Vite gallery)
`services/` — crawler (Crawlee/Playwright), api (Fastify + SQLite)

## Gates (final main)

`pnpm -w typecheck` 25 tasks ✅ · `pnpm -w test` **607 tests** across 13 packages ✅ ·
`pnpm -w build` 16 tasks ✅ · `evals/` 30 tasks / 47 points ✅ ·
`pnpm --filter @diggy/extension build` ✅ · `pnpm --filter @diggy/demo build` ✅.

Per-package tests: crawler 100 · page-agent 79 · api 67 · voice 56 · policy 53 · core 49 ·
forms 44 · avatar 41 · monitor 38 · vault 36 · activity 19 · ui 16 · shared 9.

**Always run with `NODE_ENV=development`** — this machine exports `NODE_ENV=production`, which makes
React resolve to its production build and breaks `@diggy/ui`'s `Dashboard.dom.test.tsx` (`act()`).

## Safety invariants (encoded in tests)

- Never auto-submit: policy classifies submit/pay/delete as `irreversible` → approval; no generated
  plan contains a submit step (`@diggy/policy`, `evals/plan-fill-no-submit`, `evals/refuse-submit`).
- Vault: locked values are tokenized (`{{LOCKED:key}}`); consumers never see plaintext
  (`@diggy/vault`, `@diggy/activity` redaction).
- Prompt injection: page text is data, not instructions (`@diggy/policy`, `evals/injection-review-page`).
- No provider keys in the extension bundle (background STT is backend-proxied).

## Follow-ups (hardening)

1. **Avatar is now mounted** (done) — the content script renders `<Avatar size={140}>` bottom-right of
   every page inside a Shadow DOM (`as-extension` demo posture: the content script is *static* so the
   companion is visible immediately; the production posture keeps host access optional + runtime
   registration). Still to do: forward the offscreen lip-sync level to the avatar.
2. **Browser verification** — FBX render verified in Edge (headless via the e2e harness) and framed to
   show the whole body; still to capture a pixel diff vs `diggy motion/Diggy Pastel Productivity Dashboard.png`
   and the CTRL+SPACE → STT → reply round-trip.
3. **Voice is wired (BYOK)** — Ctrl+Space records → Groq `whisper-large-v3` STT → Groq chat
   (NVIDIA NIM failover) → the reply is spoken by the offscreen browser voice and shown on the
   avatar. The user pastes their own key in DIGGY options (stored in `chrome.storage.local`), so
   nothing is bundled. Not yet done: lip-sync on the spoken reply (`speechSynthesis` cannot feed
   an analyser) and streaming partial transcripts.
4. **e2e** — `pnpm --filter @diggy/e2e test` needs Playwright browsers installed
   (`npx playwright install chromium`).
5. **Capability report** ships 8 clip FBX (+ `Chiori.fbx` = 9 FBX); 30,126 tris is 0.4% over the 30k budget.
6. **Review diffs for production**: crawler experimental adapters (Firecrawl/Crawl4AI/browser-use) are
   documented but unproven against real providers.

## Spawn recipe (validated)

1. `orca worktree create --name <name> --base-branch main --json`
2. `orca terminal create --worktree name:<name> --command "cmdc --yolo --trust --skip-onboarding" --title <name> --json`
   (mandatory for cmdc: a bare `cmdc` stalls on folder-trust and per-tool approval prompts.)
   For opencode: `--command "opencode"`, then approve the external-seed-directory prompt once.
3. `orca terminal send --terminal <handle> --text "<spec>" --enter --json` (cmdc cannot report delivery —
   inspect with `orca terminal read`; opencode needs its permission dialogs confirmed).

## Merge notes

Branch merges conflict on `agents/STATUS.md` (every worker edits it) and `pnpm-lock.yaml`. Resolve by
taking `--ours` for both, then `pnpm install --no-frozen-lockfile` regenerates the lockfile.
