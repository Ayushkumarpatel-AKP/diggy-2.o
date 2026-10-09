# w5-google — official Google connect (PKCE)

Read `agents/wave5/README.md` first (conventions).

## Target

- `apps/extension/src/google.ts` (already contains a complete PKCE flow — wire and correct it)
- `apps/extension/src/accounts.ts` (keep it compiling)
- `apps/extension/entrypoints/settings/main.tsx`
- `apps/extension/wxt.config.ts`

Read all four before changing anything, plus `apps/extension/src/provider-settings.ts` for the
storage idiom.

## Change

**1. `wxt.config.ts`**
- Add `"identity"` to `permissions` (the existing list already has
  `storage, alarms, notifications, tabs, scripting, sidePanel, offscreen, activeTab`).
- Do **not** pin a `key` — the coordinator does that.
- Leave the existing `build:manifestGenerated` hook alone (`host_permissions` stays stripped,
  `<all_urls>` stays optional). Verify the built manifest still has no `host_permissions`.

**2. `google.ts`**
- Scope list must be exactly: `gmail.readonly`, `calendar.readonly`, `calendar.events`,
  `userinfo.email` — no `openid`/`profile`/broad `calendar`.
- Ensure the PKCE flow actually works end to end with `browser.identity.launchWebAuthFlow`:
  a fresh `code_verifier`/`code_challenge` per attempt, `access_type=offline`, `prompt=consent`,
  a random `state` that is verified on return.
- Keep the exported surface (or extend it, never rename):
  `googleStatus()`, `connectGoogle(clientId)`, `disconnectGoogle()`, `listInbox(options?)`,
  `listUpcoming(days?, max?)`, `createEvent(input)`, `googleRedirectUrl()`, `GOOGLE_SCOPES`,
  `getSeenIds()`, `addSeenIds(ids)`.
- Token storage stays in `browser.storage.local` under `diggy:google`. Refresh on expiry.
- Make every failure a clear thrown `Error` with a user-safe message (no token in any message).

**3. `settings/main.tsx`** — add a second card **"Google & Apps"** below the existing
"Model source" card, reusing the page's own `card` / `Field` / `save()` idiom:

- a **Client ID** text input, persisted to `browser.storage.local` under `diggy:google-client-id`
- **Connect Google** — disabled until a client id is present; calls `connectGoogle(clientId)`;
  shows the outcome (connected email, or the error message) as the card's status line
- **Disconnect** — shown when connected; calls `disconnectGoogle()`
- a **read-only** field showing the exact redirect URI to register, from
  `googleRedirectUrl()`, selectable so it can be copied, with a small copy button
- a short numbered "Getting a client ID" list: create a Google Cloud project → enable the
  **Gmail API** and **Google Calendar API** → OAuth consent screen (External, **Testing**,
  add your own account as a **Test user**) → Credentials → Create OAuth client ID →
  type **Web application** → add the redirect URI above → paste the client id here.
  Note in one line that Gmail is a restricted scope and works in Testing mode without review.

**4. `accounts.ts`** — keep it compiling. Update it only if a `google.ts` signature changed.

## Constraints

- **No client secret anywhere.** No server calls, no `services/api`.
- Do **not** edit `apps/extension/entrypoints/background.ts` — the coordinator owns the intents
  and tools that call `google.ts`.
- No new dependency.
- Never log or throw a token; error messages must stay user-safe.

## Ownership

Yours: `apps/extension/src/google.ts`, `apps/extension/src/accounts.ts`,
`apps/extension/entrypoints/settings/main.tsx`, `apps/extension/wxt.config.ts`.
Do **not** touch any other file.

## Observable acceptance

Run and report the exact output of:

```
$env:NODE_ENV="production"; pnpm --filter @diggy/extension build
pnpm -w typecheck
```

Then confirm, by reading `.output/chrome-mv3/manifest.json`, that `identity` is present, that
`host_permissions` is absent, and paste the redirect URI host your build produces
(`https://<extension-id>.chromiumapp.org/`) plus the extension id the manifest implies.
`worker_done` must include that redirect URI verbatim — the coordinator needs it to write the
user-facing setup instructions.
