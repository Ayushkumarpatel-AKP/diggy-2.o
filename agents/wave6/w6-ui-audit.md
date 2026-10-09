# w6-ui-audit — every visible button must do something

Read `agents/wave6/README.md` and `agents/wave5/README.md` first.

## Target

`packages/ui/src/app/Dashboard.tsx`, `packages/ui/src/app/screens/*.tsx` (except
`VaultScreen.tsx` and `IntegrationsScreen.tsx` — other workers own those),
`packages/ui/src/primitives/**`, `packages/ui/src/styles.css`.

## Change

The complaint is "the sidebar is not working and half the buttons do nothing". Audit it honestly.

1. **Inventory every interactive element** in the dashboard and its screens: the tab strip, the
   screen header buttons, the quick actions, the metric tiles, chips, "View All" links, the
   composer's attach/voice/send, the status bubble, the command palette. For each one, establish
   whether it currently reaches `onAction`/`onAsk`/`onNavigate`.

2. **Fix the dead ones.** Every visible control must either perform a real action or be visibly
   disabled with a reason. Two known problems to start from:
   - `intentForLabel` in `Dashboard.tsx` does substring matching, so the quick commands'
     `intent` sentinels (`read.repo`, `form.fill`, `read.summarize`) fall through to a local
     status line instead of reaching the runtime. Match them exactly first, then fall back.
   - `packages/ui/src/app/screens/HomeScreen.tsx` renders `sampleMetrics` (all zeros) and its
     tiles `onNavigate`; make sure each tile still navigates when the coordinator passes real
     `metrics`.
   Do not invent new intents — the runtime understands: `ask`, `summarize`, `explain`, `extract`,
   `repository`, `opportunities`, `track`, `voice`, `confirm`, `deny`.

3. **Sidebar/nav**: the tab strip must stay reachable and never scroll out of view at 320–560px
   (the Edge side panel is ~400px). Verify the short-labels/greyed-state treatment and the
   active-tab indicator at that width; add CSS if something clips.

4. **Empty vs loading vs error**: every screen takes `state?: ScreenState`. Make sure switching
   between them can never leave a control in a permanently dead state.

Report a table of every control and its disposition (wired / disabled-with-reason / removed).

## Constraints

- **Additive and presentational only.** Do not add network calls, storage, or `chrome` to
  `packages/ui`.
- Do not change `packages/ui/src/index.ts` (the coordinator owns the barrel) — but if a new
  export is genuinely needed, say so in `worker_done` and the coordinator will add it.
- Keep the pastel design language; no new colours or dependencies.
- Existing tests must keep passing (`pnpm --filter @diggy/ui test`).

## Observable acceptance

```
pnpm --filter @diggy/ui typecheck
pnpm --filter @diggy/ui test
pnpm --filter @diggy/ui build
```

All clean. `worker_done` must include the control-by-control disposition table, and name any
button you had to leave disabled and why.
