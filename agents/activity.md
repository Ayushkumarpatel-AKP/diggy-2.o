# Worker brief — activity

Read `agents/ORCHESTRATION_BRIEF.md` first.

## Goal

The Activity Center: transparency is mandatory. Users must always know **what DIGGY read, filled,
opened, monitored and changed**. Implement `ActivityAPI` from `packages/shared/src/contracts/activity.ts`.

## Owns (only edit these)

`packages/activity/**`, `apps/extension/entrypoints/sidepanel/src/panels/ActivityPanel*`.

## Deliverables

1. `packages/activity`: an append-only `ActivityEvent` log with a memory + IndexedDB sink,
   `record()`, `list({since, limit})`, `onRecord()`. Port the typed activity log from
   `C:\Users\Ayush\orca\projects\diggy\packages\agent\src\activity.ts` (ActivityEvent/ActivitySink).
2. A redaction pass that replaces any locked/sensitive value with its `{{LOCKED:key}}` token before
   an event is written.
3. `ActivityPanel`: a timeline UI (Today / date filter) showing every event with kind icon + time,
   matching the theme PNG's Activity tab. Consumes the `@diggy/ui` design system.
4. Wire other modules' events (monitor, actions, forms, integrations, voice) through the bus into the log.

## Constraints / do-not-touch

- Edit only the paths above. Do not edit `@diggy/ui` components (ui worker owns them) — consume them.
- **No locked plaintext** in any activity event; tokens only.
- Events are append-only; never mutate history.

## Observable acceptance

- Tests: recording an event persists it; `list` filters by `since`; a locked value is redacted to a token.
- `pnpm -w typecheck` + `pnpm -w build` green; the panel renders a populated timeline in the demo.

## Report

Files changed, exact test command + result, and the redaction proof.
