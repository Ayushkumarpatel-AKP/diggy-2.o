# Merge review checklist (qa)

Applied by qa to **every** `worker_done` before the branch is merged. Anything that
fails is reported back to the owning worker with `file:line` evidence — the reviewer
never edits product source to make a check pass.

## 1. Contract discipline
- [ ] No file defines a shape another worker owns; new cross-package shapes come from `@diggy/shared/contracts`.
- [ ] Public surface matches the declared interface; `// INTERFACE FOR INTEGRATION` blocks are accurate.
- [ ] Imports use `.js` specifiers on relative paths (NodeNext), and no deep import past a package's `index.ts`.

## 2. No hard-coded secrets
- [ ] No API keys, tokens, passwords, or `.env` values in source, fixtures, tests, or the bundle.
- [ ] Provider keys resolve from the environment at the server/background boundary only.
- [ ] `grep` for `sk-`, `AKIA`, `ghp_`, `Bearer <literal>` returns nothing.

## 3. Permission creep
- [ ] `apps/extension/wxt.config.ts` permissions are justified by a feature in this PR.
- [ ] `host_permissions` stays empty; broad access remains `optional_host_permissions`.
- [ ] No `activeTab` → `<all_urls>` upgrade smuggled in without a runtime user grant.

## 4. Locked-data exposure
- [ ] Locked vault values never appear in prompts, logs, network payloads, screenshots, or test snapshots.
- [ ] Only `{{LOCKED:key}}` tokens cross a boundary; plaintext is released solely via `VaultAPI.resolveLocal()` after approval.
- [ ] `redactForModel` / `wrapUntrusted` are applied to every model-bound untrusted string.

## 5. Any auto-submit path
- [ ] No new code path calls `.submit()`, `requestSubmit()`, or dispatches a `submit` event.
- [ ] No generated plan emits a submit/send/delete/purchase/pay/transfer step.
- [ ] A click/press on a submit control is refused (not merely re-routed).
- [ ] `pnpm --filter @diggy/e2e test` shows `confirm-gate` and `gate-confirm` PASS.

## 6. Prompt-injection defence
- [ ] Page/scrape/plugin text is fenced as untrusted DATA and never parsed as instructions.
- [ ] `detectInjection` runs on untrusted input; tainted/outward actions are gated.
- [ ] `pnpm --filter @diggy/e2e test` shows `injection-page` and `gate-injection` PASS.

## 7. Gates
- [ ] `pnpm -w typecheck` green.
- [ ] `pnpm -w test` green (run with `NODE_ENV=development`).
- [ ] `pnpm -w build` green, and `pnpm --filter @diggy/extension build` green.
- [ ] `pnpm --filter @diggy/evals test` green.
- [ ] No `test.skip`/`it.only` left behind; tests are deterministic and need no network.
