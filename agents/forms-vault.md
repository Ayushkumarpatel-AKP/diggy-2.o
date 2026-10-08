# Worker brief — forms-vault

Read `agents/ORCHESTRATION_BRIEF.md` first.

## Goal

Smart Form Filling + the encrypted Vault. Detect → classify → match → preview → approve → fill,
**never auto-submit**, and locked values never leave the device. Implement `VaultAPI` from
`packages/shared/src/contracts/vault.ts`.

## Owns (only edit these)

`packages/vault/**`, `packages/forms/**`, `apps/extension/src/field-mapper*`.

## Deliverables

1. `vault`: port `crypto.ts` (Argon2id via hash-wasm + WebCrypto AES-256-GCM), `lock.ts`,
   `profile.schema.ts`, `store.ts` (IndexedDB via dexie) from
   `C:\Users\Ayush\orca\projects\diggy\packages\vault`. Add `tokenFor()` / `resolveLocal()` per the contract:
   locked values are only ever seen as `{{LOCKED:key}}` by consumers; resolution happens in-page after
   per-use approval and is never logged.
2. `forms`: field detection + classification + confidence matching + a **preview** step + an approval
   gate + human-like fill (native setters + input/change events for React/Vue, `DataTransfer` uploads).
3. `apps/extension/src/field-mapper.ts`: port from the seed repo; wire to the Vault profile.
4. Resume / projects / skills / links matching, with a saved-answers library.
5. Screen-masking helper for any future vision path: mask locked/sensitive input regions before capture.

## Constraints / do-not-touch

- Edit only the paths above.
- **Never auto-submit**; the final Submit is a human action (policy-owned).
- Locked plaintext must never appear in prompts, logs, network payloads, or screenshots.
- No passwords/cookies/session tokens stored.

## Observable acceptance

- Tests: a locked field resolves only via `resolveLocal()` after approval; consumers only receive the
  token; no fill routine emits a submit call.
- Fixture form filled ≥95% correct in dry-run; ambiguous fields trigger a question rather than a guess.
- `pnpm -w typecheck` + `pnpm -w build` green.

## Report

Files changed, exact test command + result, and the token-leak test proving no plaintext escapes.
