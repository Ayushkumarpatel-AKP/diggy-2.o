# w7-keys — paste your API keys in the side panel, not the options page

Read `agents/wave7/README.md` first (it has the frozen `SetupPanelProps`).

## Target

`packages/ui/src/app/SetupPanel.tsx` (new file) — **nothing else.**

## Change

The user: *"I don't want to open extension options to fill the API key, bring this into the
sidebar panel so I can easily access it with security."*

Build the exact `SetupPanel` from the wave README: a compact, self-contained panel that lives
inside the side panel and edits the three credential groups.

- **Primary model**: provider `<select>` (from `presets`), API key, base URL, chat model.
- **Fallback model**: an enable toggle plus its own provider/key/base/model. One line explaining
  it is used automatically when the primary is rate-limited, out of quota or down — that is the
  reason to bother.
- **Web search**: Tavily key + a "prefer my local crawler" checkbox (Tavily key only, no URL
  editing).
- **Save** calls `onSave(values)`; `status` shows the result. A **Close** button calls `onClose`.

**Security requirements — these are the point of the task:**
- every key field is `<input type="password">` with `autoComplete="off"` and `spellCheck={false}`
- a key is shown only as dots; add a per-field **Show/Hide** toggle that reveals it only while
  held/pressed, and reset to hidden whenever the panel re-renders from new props
- never write a key into a URL, a `title`, an `aria-label`, or any DOM attribute
- never log a key; no `console.*` in this file
- a small note that keys are stored on this device only and sent only to the provider the user
  chose

Fit the existing design: reuse `Button`, `Pill`, `Panel`/`Card` and the theme tokens rather than
inventing styles.

## Constraints

- `packages/ui` stays browser-agnostic: no `chrome`/`browser`/`fetch` here. It is a form; the host
  persists.
- Do not touch any other file, including `Dashboard.tsx` and `index.ts` (the coordinator mounts
  and exports it).
- No new dependency.
- Keep it usable at 320–560px wide — the Edge side panel is ~400px.

## Observable acceptance

```
pnpm --filter @diggy/ui typecheck
pnpm --filter @diggy/ui test
pnpm --filter @diggy/ui build
```

All clean. `worker_done` must paste the final `SetupPanelProps` and confirm, in one line each, the
five security requirements above.
