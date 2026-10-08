# Worker brief — integrations

Read `agents/ORCHESTRATION_BRIEF.md` first.

## Goal

Connect DIGGY to the outside world: productivity + student + creator packs, OAuth, and a connector
registry. Plugin → Event → Diggy Brain → Notification.

## Owns (only edit these)

`services/api/**`, `apps/extension/src/{google,gmail-session,ics,accounts,api-client}.ts`.

## Deliverables

1. `services/api` (Fastify + SQLite): port `db.ts`, `oauth.ts`, `crypto.ts`, `providers.ts`
   (registry: google/notion/github/youtube), `routes/{actions,auth,plugins,preview}.ts` from
   `C:\Users\Ayush\orca\projects\diggy\services\api`.
2. Productivity: **Gmail, Calendar, GitHub, Notion**. Calendar read/write + `.ics` export fallback.
3. Student pack: SIH, LeetCode, Codeforces, hackathons, scholarships. Creator pack: YouTube, LinkedIn,
   X, Reddit. Store account links only — never credentials.
4. **MCP connector registry** (openbrowse `packages/connectors` pattern) so connectors are pluggable.
5. Optional **MCP task-delegation server** with a token handshake (webbrain concept) so a coding agent
   can delegate browser tasks — task-level tools only, never raw primitives that bypass the policy gate.
6. Encrypted token storage server-side; the extension never holds provider secrets.

## Constraints / do-not-touch

- Edit only the paths above.
- No secrets in the extension bundle. OAuth tokens encrypted at rest server-side.
- Respect each provider's terms; link-only for accounts without an API.

## Observable acceptance

- Tests: OAuth callback stores an encrypted token; `/api/plugins` lists the registry; `.ics` export
  produces a valid calendar file.
- `pnpm -w typecheck` + `pnpm -w build` green; API service starts and `/api/auth` responds.

## Report

Files changed, exact test command + result, which providers are live vs. link-only.
