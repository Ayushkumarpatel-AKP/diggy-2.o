# Worker brief — brain

Read `agents/ORCHESTRATION_BRIEF.md` first.

## Goal

The Diggy Brain: a provider-agnostic model layer with **Groq primary → NVIDIA NIM failover**, an
agent planning + multi-step execution loop, and memory/context management. Implement the `Provider`
contracts from `packages/shared/src/contracts/provider.ts`.

## Owns (only edit these)

`packages/core/**`.

## Deliverables

1. `providers/groq.ts` (`openai/gpt-oss-120b`, STT `whisper-large-v3`), `providers/nvidia-nim.ts`
   (`openai/gpt-oss-20b`), `providers/http.ts` (shared OpenAI-compatible client). Port from
   `C:\Users\Ayush\orca\projects\diggy\packages\core\src\providers`.
2. `registry.ts` implementing `ProviderRegistry`: ordered failover chain, auto-switch on failure,
   retry with backoff, health checks, latency + cost tracking. Users never see a provider switch.
3. `orchestrator.ts`: the agent run loop (browser-use style) — plan → act → observe → repeat, with a
   configurable step budget (default 130, hard cap 195) and a `Continue` signal at the limit.
4. `prompt.ts`: system-prompt layering with `extend`/`override` semantics + the DIGGY persona
   (friendly, concise, Hinglish-capable). Deterministic defaults: temperature 0.15 for browser-control,
   0.3 for ask, 0 for vision.
5. `memory/`: per-tab conversation history + local user memory (stated preferences) + smart-context
   compaction (token-aware auto-compaction, tool-result limits, overflow recovery).
6. `skills.ts`: on-demand skill loader (agentskills.io-style) for trusted instructions.
7. `providers/registry-catalog.ts`: model-agnostic registry so future OpenAI/Anthropic/Gemini/OpenRouter
   are one file each.

## Constraints / do-not-touch

- Edit only `packages/core/**`. Tools live in `actions`/`page-agent`; do not define ActionAPI here.
- No provider key ever leaves the server side / enters the extension bundle.
- No vendor lock: everything goes through the `Provider` interface.

## Observable acceptance

- Unit tests: failover (Groq fails → NVIDIA answers), retry/backoff, chain ordering, health gating,
  cost/latency accounting.
- A test proves a run stops at the step budget and surfaces `Continue`.
- `pnpm -w typecheck` + `pnpm -w build` green.

## Report

Files changed, exact test command + result, failover proof, and any contract gap.
