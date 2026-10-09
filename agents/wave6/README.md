# Wave 6 — make every feature work end to end

Four workers on disjoint files, plus the coordinator on the background wiring. Read
`agents/wave5/README.md` first — the conventions there (ESM, strict TS, `.js` relative imports,
vitest, no `chrome` outside `apps/extension`, `TURBO_CONCURRENCY=2`, `NODE_ENV=production` for
extension builds, this box has 5.9 GB of RAM) all still apply.

## Why this wave

Most of these features are **built but never plugged in**, which is why they read as broken.
Wave 5 merged a reminders engine, a monitor runtime, a live activity log, a Vault and a Google
PKCE flow — and the background imports none of them. The coordinator is wiring those this wave;
your jobs below are the parts that are genuinely missing or wrong.

## Ownership map

| Worker | Owns | Does not touch |
|---|---|---|
| **coordinator** | `apps/extension/src/{agent-runtime,agent-tools,agent-progress,page-tools,provider-settings,search-web,chat-history}.ts`, `apps/extension/entrypoints/{background,content,sidepanel/main}.tsx` | anything else |
| **w6-settings** | `apps/extension/entrypoints/settings/main.tsx` **and nothing else** | any other file |
| **w6-vault** | `apps/extension/src/vault-runtime.ts` (new), `packages/ui/src/app/screens/VaultScreen.tsx` | any other file |
| **w6-integrations** | `packages/ui/src/app/screens/IntegrationsScreen.tsx`, `packages/ui/src/logos/**` (new), `apps/extension/src/connectors/**` (new) | any other file |
| **w6-ui-audit** | `packages/ui/src/app/Dashboard.tsx`, `packages/ui/src/app/screens/*.tsx` (except VaultScreen + IntegrationsScreen), `packages/ui/src/primitives/**`, `packages/ui/src/styles.css` | `packages/ui/src/index.ts` (coordinator), the two screens the other workers own |

If your brief turns out to be wrong, say so in `worker_done` rather than silently diverging —
last wave a worker correctly caught two bad names in my frozen interface and that was the most
useful thing it did.

## Frozen interfaces

```ts
// storage keys the extension already reads/writes — do not invent new ones
"diggy:providers"           // ProviderSettings (primary)   [exists]
"diggy:providers:fallback"  // { presetId, apiKey, baseUrl?, model? }  [exists, no writer yet]
"diggy:google-client-id"    // string                       [exists]
"diggy:google"              // tokens                       [exists]
"diggy:reminders"           // Reminder[]                   [exists]
"diggy:watches-v2"          // WatchRecord[]                [exists]
"diggy:search"              // { tavilyKey: string; preferLocal?: boolean }  [NEW — w6-settings writes it]
"diggy:vault"               // vault blob (own store, IndexedDB)            [w6-vault]
```

```ts
// apps/extension/src/vault-runtime.ts — w6-vault owns this exact shape
export interface VaultRuntimeStatus { exists: boolean; unlocked: boolean }
export interface VaultRuntime {
  status(): Promise<VaultRuntimeStatus>;
  create(passphrase: string, data: VaultData): Promise<void>;
  unlock(passphrase: string): Promise<boolean>;
  lock(): void;
  profile(): Promise<ProfileSchema>;              // locked fields come back as {{LOCKED:key}}
  resolve(key: string, approve: () => boolean | Promise<boolean>): Promise<string | null>;
  onChange(listener: (unlocked: boolean) => void): () => void;
}
export function createVaultRuntime(): VaultRuntime;
```

Use the real `@diggy/vault` API (`Vault.create/open/unlock/lock/getProfile/resolveLocal/
setVisibility/onChange`, `IndexedDbAdapter`) — do not reimplement any of it. `resolveLocal`
already defaults to deny and needs an approval gate; thread the caller's `approve` into it.

## Reporting

`worker_done` with `--outcome`, the exact commands and their real output, and the exported
signatures you settled on. Do not commit and do not push; leave your work in your worktree.
