# DIGGY 2.0 — Lead Plan

## Goal

Ship DIGGY 2.0: a Personal AI Browser Companion (MV3 extension + Fastify services + FBX avatar)
with the Monitor Engine as the main USP, built by a supervised Orca fleet with `pnpm -w typecheck`,
`pnpm -w test`, `pnpm -w build` green at every gate.

## Operating mode

Leader (this Command Code session) coordinates, writes contracts, reviews and merges. Workers run in
Orca-managed worktrees on branch `agent/<name>`, each reading `agents/ORCHESTRATION_BRIEF.md` then
`agents/<name>.md`. Engines: **Command Code (`cmdc`)** for deep, high-context modules; **OpenCode
(`opencode`)** for self-contained modules and as the fallback for any stalled CMdC worker.

## Roster & ownership

| Agent | Engine | Owns (only edits these) | Delivers |
|---|---|---|---|
| leader | Command Code | `agents/**`, `contracts/**`, root cfg, integration | plan, board, contracts, merges, gates |
| core | cmdc | root cfg, `packages/shared/**`, extension manifest/`wxt.config.ts`/`background.ts` | skeleton, bus, storage, provider iface, MV3 perms/CSP |
| avatar | cmdc | `packages/avatar/**`, `assets/avatar/**` | FBX engine + VRM fallback, 12-state machine, expressions, lip-sync anchor |
| brain | cmdc | `packages/core/**` | provider failover (Groq→NVIDIA), planner, multi-step loop, memory/compaction, skills |
| monitor | cmdc | `packages/monitor/**`, `services/crawler/**` | Monitor Engine (USP) + crawler (Crawlee/Playwright) + extractor adapters |
| actions | cmdc | `packages/page-agent/**`, `packages/policy/**` | Action Engine + tool registry + plan-before-act + safety gates |
| ui | cmdc | `packages/ui/**`, `entrypoints/sidepanel/**`, `apps/demo/**` | pastel+gold 7-tab dashboard, command palette, pop-out panel |
| forms-vault | opencode | `packages/vault/**`, `packages/forms/**`, `src/field-mapper*` | form fill (never submit) + encrypted vault |
| integrations | opencode | `services/api/**`, `src/{google,gmail-session,ics,accounts,api-client}.ts` | Gmail/Calendar/GitHub/Notion + packs, OAuth, MCP registry |
| voice | opencode | `entrypoints/offscreen/**`, `src/shortcut.ts`, `packages/voice/**` | CTRL+SPACE PTT, STT/TTS, lip-sync feed |
| activity | opencode | `packages/activity/**`, Activity panel | Activity Center transparency log + timeline |
| qa | cmdc | `e2e/**`, `evals/**`, `**/*.test.ts` | Playwright e2e, eval harness, gates, merge review |

## Milestones / phases

0. **Contracts** (leader) — `@diggy/shared` contracts + tokens merged; typecheck/build green.
1. **Foundation** (core → avatar + brain + ui) — extension builds; FBX loads + capability report;
   bubble tracks the head; Groq answers with NVIDIA failover proven.
2. **Monitor + Act** (monitor, actions, forms-vault, voice) — a watch fires on a real change and
   raises an avatar alert; plan-before-act works; never submits without approval; CTRL+SPACE round-trip.
3. **Integrations** (integrations, activity, demo/desktop) — Gmail/Calendar/GitHub connect; Activity timeline.
4. **Harden** (qa, leader) — full test/e2e/evals green; security/permission/injection review.

## Risks & mitigations

- **License contamination:** WebBrain GPL-3.0 and Firecrawl AGPL-3.0 — ideas / hosted API only, never code.
- **FBX in MV3:** `web_accessible_resources`, VRM fallback, triangle/FPS budget.
- **Merge churn:** contracts-first + single-owner file lists + one-branch-at-a-time merges.
- **CMdC stall/rate-limit:** documented OpenCode fallback per brief.
- **Python sidecar:** optional, dockerized, never a build dependency of the extension.

## Definition of done

`pnpm -w typecheck && pnpm -w test && pnpm -w build` green; `apps/extension/.output/chrome-mv3` loads
unpacked; e2e + evals green; every brief bullet reported done/blocked with evidence.
