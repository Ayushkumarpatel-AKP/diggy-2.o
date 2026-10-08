# Worker brief — qa

Read `agents/ORCHESTRATION_BRIEF.md` first.

## Goal

Own the verification layer: e2e, evaluations, and review of every merge. The gates in
`agents/PLAN.md` are yours to enforce.

## Owns (only edit these)

`e2e/**`, `evals/**`, `**/*.test.ts` (test files anywhere), `.github/workflows/ci.yml`.

## Deliverables

1. `e2e`: Playwright harness loading `.output/chrome-mv3` unpacked. Port `run.mjs`, `harness.mjs`,
   `extension.mjs` from `C:\Users\Ayush\orca\projects\diggy\e2e`. Cover:
   - **Confirm gate**: a form fill never submits without a human confirmation.
   - **Policy**: sensitive-site blocklist + irreversible-step approval.
   - **Injection**: fixtures where the page tries "ignore previous instructions".
   - **Monitor**: baseline → change → one event → dedupe.
2. `evals`: a benchmark/eval harness (browser-use benchmark idea) over a small task set with
   golden recordings, scoring pass/fail + steps. Port the seed repo's `evals/`.
3. `ci.yml`: Node 22 + pnpm 9.15 + `NODE_ENV=development` → typecheck + test + extension build.
4. Per-phase gate scripts: `pnpm -w typecheck && pnpm -w test && pnpm -w build` + the phase-specific checks.
5. A **review checklist** applied to every `worker_done`: contract violations, hard-coded secrets,
   permission creep, locked-data exposure, any auto-submit path.

## Constraints / do-not-touch

- Edit only tests, `e2e/**`, `evals/**`, `ci.yml`. Do not edit product source to make a test pass —
  report the defect to the owning worker instead.
- Tests must be deterministic; no network dependence in unit tests (fixtures/mocks only).

## Observable acceptance

- `pnpm -w test` green; `pnpm --filter @diggy/e2e test` green against the built extension.
- A failing form-fill-submit test proves the confirm gate is real (negative test).
- CI workflow config is valid YAML and mirrors the local gates.

## Report

Files changed, the exact gate commands + results, and a per-phase gate report once workers land.
