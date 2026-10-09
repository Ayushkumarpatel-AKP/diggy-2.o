# w6-integrations — real one-click integrations with brand marks

Read `agents/wave6/README.md` and `agents/wave5/README.md` first.

## Target

- `packages/ui/src/app/screens/IntegrationsScreen.tsx`
- `packages/ui/src/logos/**` (new)
- `apps/extension/src/connectors/**` (new)

## Change

**1. `packages/ui/src/logos/`** — one small module exporting a `BrandMark` component:
`{ id: string; label: string; color: string; mark: string }` rendered as a rounded tile in the
brand colour with a short monogram or wordmark. Cover at least: **Google (Gmail, Calendar),
GitHub, Notion, YouTube, Slack, Discord, Linear, Spotify**.

Draw these yourself as inline SVG/CSS. **Do not download or copy official logo files** — brand
assets are trademarked and come with usage guidelines. A recognisable monogram in the correct
brand colour is what the existing screen already does; keep that approach and keep it tasteful.

**2. `IntegrationsScreen.tsx`** — the screen currently renders `sampleIntegrations`
(an intentionally empty array) with "Connect" buttons that do nothing. Make it real:
- take an optional `integrations?: IntegrationRow[]` prop (the coordinator supplies it) and keep
  the existing empty state when it is absent
- each row: brand mark, name, category, and a status chip — **Connected** / **Connect** /
  **Connecting…** / **Needs attention** (with the reason on hover or below)
- a **Connect** button calls `onCommand(`${row.name} connect`, `integration.connect:${row.id}`)`
  and a connected row offers **Disconnect** the same way; never do the OAuth work in the UI
- a small counter ("3 of 8 connected") and an honest empty state when nothing is connected

**3. `apps/extension/src/connectors/`** — the connect flows, one module per service, all behind
one factory the coordinator calls:
```ts
export interface Connector {
  id: string; label: string; category: 'Productivity' | 'Development' | 'Social';
  status(): Promise<'connected' | 'disconnected' | 'error'>;
  connect(): Promise<{ ok: boolean; error?: string }>;
  disconnect(): Promise<void>;
}
export function createConnectors(): Connector[];
```
- **GitHub**: a personal-access-token field is the honest path (`GET /user` with
  `Authorization: Bearer <token>` validates it). Store under `diggy:connectors:github`.
- **Notion**: an integration token (`POST https://api.notion.com/v1/search` with
  `Authorization: Bearer <token>` and `Notion-Version: 2022-06-28`). Store under
  `diggy:connectors:notion`.
- **YouTube**: needs no credential — it is the page-driving tool the coordinator owns; report it
  as `connected` when available so the screen is truthful.
- **Google**: delegate to the existing `apps/extension/src/google.ts`
  (`googleStatus`/`connectGoogle`/`disconnectGoogle`). Do not duplicate the PKCE flow.
- **Slack / Discord / Linear / Spotify**: implement `status()` as `disconnected` and `connect()`
  as `{ ok: false, error: 'Not wired yet' }` — do **not** fake a connection. The screen will show
  them honestly as not connected. Say so in your report.

## Constraints

- Never render, log or return a token to the UI.
- `packages/ui` stays browser-agnostic — no `chrome`/`browser` there; `connectors/` may use
  `wxt/browser`.
- Do not touch `Dashboard.tsx` (w6-ui-audit) or `packages/ui/src/index.ts` (coordinator).
- No new dependency.

## Observable acceptance

```
pnpm --filter @diggy/ui typecheck
pnpm --filter @diggy/ui build
pnpm --filter @diggy/extension typecheck
```

All clean. Report the `IntegrationRow` shape you settled on, the connector ids, and an explicit
list of which connectors are genuinely functional versus honestly stubbed.
