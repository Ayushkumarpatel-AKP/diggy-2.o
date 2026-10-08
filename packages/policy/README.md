# @diggy/policy — agent security policy layer

A dependency-free gate that sits **between the model and the tool executors**.
Before any tool call runs, ask this package what to do. No DOM, no `chrome`, no
third-party imports; nothing throws on garbage input.

## API

```ts
import { decide, markUntrusted, isSensitiveSite, wrapUntrusted, redactForModel } from '@diggy/policy';

const result = decide(toolName, args, { origin: 'user', siteAllowlist });
// result.decision: 'allow' | 'confirm' | 'deny'   (+ reason, category, confirmPayload?)
```

| Module | Exports |
|---|---|
| `classify.ts` | `classifyTool`, `TOOL_CLASSIFICATION`, `isOutwardEffect` |
| `decide.ts` | `decide` |
| `taint.ts` | `markUntrusted`, `isTainted`, `getTaintState`, `resetTaint` |
| `sites.ts` | `isSensitiveSite`, `sensitiveSiteCategory`, `isSiteAllowlisted` |
| `untrusted.ts` | `wrapUntrusted`, `buildUntrustedGuard`, `detectInjection` |
| `quarantine.ts` | `summarizeUntrusted`, `QUARANTINE_CALLER_OBLIGATION` |
| `vault.ts` | `redactForModel`, `VAULT_SENTINEL`, `registerVaultValue(s)` |

## The policy matrix

Decision order (most severe first): **unknown tool → sensitive site →
irreversible → tainted/injected outward → allow**.

| Tool / condition | Class | Default decision |
|---|---|---|
| `readPage`, `getProfile`, `listReminders`, `crawl`, `searchWeb`, `readInbox`, `readCalendar`, `readTranscript`, `readThread`, `readDocument`, `pluginRead` | `read` | **allow** |
| `fillForm` (no `submit`), `createReminder`, `notify`, `speak`, `setMood`, `playAnim`, `pluginWrite` | `write` | **allow** (confirm while tainted / injected) |
| `fillForm`/`submitForm` with `submit: true` | `irreversible` | **confirm** |
| `send`, `sendEmail`, `sendMessage`, `submit`, `delete`, `purchase`, `pay`, `transfer`, `post`, `comment` | `irreversible` | **confirm** |
| anything not in the registry | `unknown` | **deny** |
| bank / payment / password-manager / health site (not allow-listed) | any | **deny** |
| any outward tool while the session is tainted | write/irreversible | **confirm** |
| any outward tool whose args look like an injected instruction | write/irreversible | **confirm** |

`decide()` never returns `allow` for an irreversible tool or for an outward tool
while tainted. Confirmations carry a `confirmPayload` whose `preview` is already
run through `redactForModel`, so a vault value cannot leak into the UI.

## Safety guarantees

- **Never default to allow** — an unclassified tool is denied.
- **Sensitive sites are symmetric** — reading a bank page is as blocked as acting
  on it; the per-site allow list is the only override.
- **Taint forces confirmation** — once untrusted content is in context, every
  outward effect confirms.
- **Vault values never leave** — `redactForModel` scrubs registered values and
  sensitive keys (`password`, `pan`, `bank`, `dob`, …).
- **Signed-in reads are quarantined** — `summarizeUntrusted` hands raw text to a
  no-tools reader and returns only the summary.
