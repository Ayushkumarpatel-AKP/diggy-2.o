# Worker brief — core

Read `agents/ORCHESTRATION_BRIEF.md` first. You own the repo skeleton and the shared plumbing.
**This work merges before any feature worker starts.**

## Goal

Make `DIGGY 2.O` a working pnpm + Turborepo monorepo skeleton with a WXT MV3 extension that builds,
plus the shared runtime plumbing (`@diggy/shared` is already scaffolded — finish it).

## Owns (only edit these)

`pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `package.json` (root), `.gitignore`,
`packages/shared/**`, `apps/extension/**` (manifest + `wxt.config.ts` + `entrypoints/background.ts` +
`src/storage.ts`).

## Deliverables

1. Scaffold `apps/extension` with WXT 0.19 + React 18 + Tailwind 3, MV3. Entrypoints modelled on
   openbrowse's layout: `background/`, `content/`, `sidepanel/`, `offscreen/`, `overlay/`, `settings/`.
   It must `pnpm --filter @diggy/extension build` to `.output/chrome-mv3`.
2. Finish `packages/shared`: keep the contracts in `src/contracts/*`, add a small `MessageBus`
   implementation (`createBus()`) implementing `packages/shared/src/contracts/bus.ts`, and a
   `createBus()` + typed `storage` helper. Keep `pnpm -w typecheck` and `pnpm -w build` green
   (fix the "no output files" warning by giving shared a real `build` → `dist` or a documented noop).
3. `apps/extension/src/storage.ts`: `chrome.storage.local` wrappers + IndexedDB placeholder.
4. `manifest` permissions/CSP: `storage`, `alarms`, `notifications`, `tabs`, `scripting`, `sidePanel`,
   `offscreen`, `activeTab`; `optional_host_permissions: ["<all_urls>"]` (requested at runtime, never
   bundled as required). No provider keys anywhere in the bundle.
5. Root scripts (`build/dev/typecheck/test/lint/clean`) wired through Turbo.

## Constraints / do-not-touch

- Do NOT implement avatar, brain, monitor, actions, ui, vault, voice, integrations, activity logic —
  other workers own those. Only the plumbing above.
- Do not add `@ai-sdk/openai-compatible`; the brain worker owns provider clients.
- No secrets, no network keys, no auto-submit code.

## Observable acceptance

- `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build` all green.
- `pnpm --filter @diggy/extension build` produces `apps/extension/.output/chrome-mv3`.
- A `@diggy/shared` unit test proves `createBus()` emit/on works and tokens export the pastel+gold palette.

## Report

Files changed, exact commands + results, and any contract you could not satisfy.
