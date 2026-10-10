# w7-panels — make the Integrations, Actions and Monitor panels actually work

Read `agents/wave7/README.md` first.

## Target

`packages/ui/src/app/screens/{IntegrationsScreen,ActionsScreen,MonitorScreen}.tsx` and
`packages/ui/src/app/Dashboard.tsx`.

## Change

The user's words: *"integration panel, action panel not working buttons or I don't understand how
it works"*. Both halves of that are fixable.

**1. The buttons do nothing.** A screen calls `onCommand(label, intent)`, which lands in
`Dashboard.handleCommand`. That maps a label through `intentForLabel` and only forwards a small
set of known intents; anything else becomes a local status line that goes nowhere. So the fix is
in `handleCommand`: **forward an explicit `intent` verbatim** when the screen supplies one, and
only fall back to label matching when it does not. Do not invent new intents — the runtime
understands exactly these:

```
ask | summarize | explain | extract | repository | opportunities | track | voice | confirm | deny
setup.open | integration.connect | integration.disconnect | vault.status | vault.lock | usage | state | chat.clear
```

For an integration, pass the id in the label so the host can route it:
`onCommand(`${row.name} connect`, `integration.connect:${row.id}`)`.

**2. "I don't understand how it works."** Every panel needs to explain itself in one line, and
every control needs to say what it will do. Concretely:
- **Integrations**: under the header, one sentence on what connecting does and that it is optional.
  Each row shows what the service is *for* ("Gmail — read and search your mail"), its status, and
  a Connect / Disconnect button. A row that cannot connect yet must **say so and why** rather than
  offering a button that silently fails.
- **Actions**: it currently shows an empty log. Give it a real empty state that explains what will
  appear here ("Things DIGGY has done for you — filled forms, summaries, reminders — show up
  here"), and make sure each row's controls reach a real handler or are visibly disabled with a
  reason.
- **Monitor**: explain that a watch checks a page on a schedule and tells you when it changes, and
  give it a real empty state pointing at the "Track this page" action.

Keep every screen presentational: props in, `onCommand` out. No `chrome`, no storage, no fetch.

## Constraints

- Do not change `packages/ui/src/index.ts`. If you need a new export, say so in `worker_done`.
- Do not touch `SetupPanel.tsx` (w7-keys owns it).
- Keep the existing pastel design language; no new dependency.
- The 30 existing `@diggy/ui` tests must still pass.

## Observable acceptance

```
pnpm --filter @diggy/ui typecheck
pnpm --filter @diggy/ui test
pnpm --filter @diggy/ui build
```

All clean. `worker_done` must list every control you touched and where it now goes.
