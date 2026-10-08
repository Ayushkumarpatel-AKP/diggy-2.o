# Worker brief — ui

Read `agents/ORCHESTRATION_BRIEF.md` first.

## Goal

Build DIGGY's premium pastel + gold interface: the 7-tab side-panel dashboard from the theme PNG,
a status/thought bubble, and the command palette. **The design source of truth is
`diggy motion/Diggy Pastel Productivity Dashboard.png`** — match it closely.

## Owns (only edit these)

`packages/ui/**`, `apps/extension/entrypoints/sidepanel/**`, `apps/extension/entrypoints/overlay/**`,
`apps/demo/**`.

## Deliverables

1. `packages/ui`: design system from `packages/shared/src/tokens.ts` — pastel surfaces, rounded cards,
   soft shadows, amber/gold primary, the 3 browser dots. Components: Panel, Card, MetricTile, Pill,
   List row, Alert row, Tabs, Button, Input, Avatar chip.
2. `sidepanel`: the **7 tabs** in the exact order (`NAV_TABS` in `packages/shared/src/contracts/nav.ts`):
   Home, Assistant, Monitor, Actions, Integrations, Vault, Activity. Home shows metric tiles
   (Websites monitoring / New alerts / Actions completed / Integrations active), Recent Alerts,
   and Quick Commands (Track this site · Summarize page · Fill form · Explain page · Analyze repository).
3. **Command palette** overlay `Alt+K` (openbrowse) + **detachable/pop-out panel** `Alt+Space`.
4. Status/thought bubble anchored to the avatar head: one line at a time, 💭/speech styles,
   priority dot, typewriter reveal, queue by priority, collapse to a 💭 chip. Consumes `AvatarAPI.status`.
5. `apps/demo`: a Vite gallery rendering every screen/tab/component for review.
6. Golden-D logo integration (from `diggy motion/Cheerful Golden D Mascot Logo.png`) in the sidebar.

## Constraints / do-not-touch

- Edit only the paths above. Do not edit `packages/avatar`, `packages/core`, `packages/monitor`, etc.
- Consume contracts; do not invent types. If a data shape is missing, stub `// TEMP STUB — blocked on <owner>`.
- No neon/gaming themes; keep it low-noise, high-readability, rounded, premium.

## Observable acceptance

- `apps/demo` renders all 7 tabs + components with no console errors.
- Screenshot of the demo visually matches the theme PNG's layout language (sidebar, tiles, pastel cards).
- `pnpm --filter @diggy/demo build` and `pnpm -w build` green.

## Report

Files changed, how to run the demo, and any screen you could not match.
