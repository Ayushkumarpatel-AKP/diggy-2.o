# w6-vault — construct the Vault and give it a real screen

Read `agents/wave6/README.md` and `agents/wave5/README.md` first.

## Target

- `apps/extension/src/vault-runtime.ts` (new) — the frozen `VaultRuntime` in the wave README
- `packages/ui/src/app/screens/VaultScreen.tsx` — replace the placeholder with a real screen

Read `packages/vault/src/{index,vault,store,lock,profile.schema,crypto}.ts` and
`packages/shared/src/contracts/vault.ts` before writing. **Reimplement nothing** — `@diggy/vault`
already does Argon2id + AES-256-GCM, auto-lock, `getProfile`, `resolveLocal` (deny by default)
and `setVisibility`.

## Change

**1. `vault-runtime.ts`** — implement the frozen interface exactly, over the real package:
`Vault.create(store, passphrase, data)` / `Vault.open(store, passphrase)`, `unlock`, `lock`,
`getProfile`, `resolveLocal` gated by the caller's `approve` callback, `onChange`. Use
`IndexedDbAdapter`; guard every `indexedDB`/`browser` access so the module still *imports* under
a plain node test. `status()` must never throw — a corrupt or absent vault reports
`{ exists: false, unlocked: false }`.

**2. `VaultScreen.tsx`** — presentational, driven by props (the coordinator wires it):
- a locked state: passphrase field + **Create vault** / **Unlock** buttons, with a short line on
  what the Vault is for ("DIGGY can fill forms with this and answer questions from it. Locked
  fields need your approval each time.")
- an unlocked state: the profile grouped sensibly (identity, education, links, custom), each row
  showing its value **or** a "Locked" chip with a per-row visibility toggle (shared ↔ locked)
- a **Lock now** button and the auto-lock countdown if the package exposes one
- honest empty state when the vault exists but has no fields
- never render a real secret inline: a locked field shows the token `{{LOCKED:key}}` or a masked
  value, never plaintext
- props: keep it presentational — `{ status, profile, onUnlock, onCreate, onLock, onToggleVisibility, state? }`
  and export the prop interface so the coordinator can wire it without reading your diff.

## Constraints

- No DOM crypto of your own. No new dependency.
- `packages/ui` stays browser-agnostic: no `chrome`/`browser`/`indexedDB` in the screen file.
- `VaultScreen` is currently rendered by `Dashboard` with only `onCommand`; **do not change
  `Dashboard.tsx`** (w6-ui-audit owns it) — make every new prop optional so it still renders
  when only `onCommand` is passed.

## Observable acceptance

```
pnpm --filter @diggy/ui typecheck
pnpm --filter @diggy/ui build
pnpm --filter @diggy/extension typecheck
```

All clean. Report the exact prop interface of `VaultScreen` and the `VaultRuntime` signatures.
