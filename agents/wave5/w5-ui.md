# w5-ui — bubble actions, live status, real-data props

Read `agents/wave5/README.md` first (conventions).

## Target

`packages/ui` only. Read `packages/ui/src/primitives/StatusBubble.tsx`,
`packages/ui/src/app/Dashboard.tsx`, `packages/ui/src/hooks/{statusQueue,useStatusQueue}.ts`,
`packages/ui/src/app/ScreenState.tsx` and the screens under `packages/ui/src/app/screens/`
before writing.

## Change

The side panel currently cannot receive anything from the background, and the status bubble
cannot ask the user a question. Fix both, plus let the screens take real data.

**1. `src/primitives/StatusBubble.tsx`** — add an optional `actions?: ReactNode` prop, rendered
in a `<div className="dg-bubble__actions">` under the text row (only when provided). Keep the
typewriter, the collapse toggle and the `api?.status(text)` forwarding exactly as they are.

**2. `src/app/Dashboard.tsx`** — add these optional props and honour them:

```ts
liveStatus?: { id: string; text: string; priority?: StatusPriority; style?: BubbleStyle };
pendingConfirmation?: {
  id: string;
  title: string;
  detail?: string;
  confirmLabel?: string;   // default "Approve"
  denyLabel?: string;      // default "Cancel"
  onConfirm: () => void;
  onDeny?: () => void;
};
onStatusPush?: (push: (update: StatusUpdate) => void) => void;
```

- `liveStatus`: an effect pushes it into the existing `useStatusQueue` **with `id` included**,
  so the next step with the same id **replaces** the current line rather than queueing behind
  it. (`StatusUpdate` already has an optional `id`; confirm how `insertByPriority`/the hook
  treats it and make replacement the behaviour for a repeated id.)
- `pendingConfirmation`: when present, the dock shows the confirmation with
  `variant="speech"`, `priority={2}`, its `title` as the bubble text, and Confirm/Deny buttons
  wired to `onConfirm`/`onDeny` passed through `StatusBubble`'s new `actions`.
- `onStatusPush`: called once on mount with the queue's `push` function.

**3. Real-data props** — each optional, each defaulting to the existing (empty) `sample*` value
so nothing changes when they are omitted:

| Screen | New optional prop |
|---|---|
| `HomeScreen` | `metrics?: MetricData[]`, `alerts?: AlertData[]` |
| `MonitorScreen` | `watches?: WatchRow[]` |
| `ActivityScreen` | `events?: ActivityEvent[]` |
| `IntegrationsScreen` | `integrations?: IntegrationRow[]` |

`Dashboard` takes same-named optional props and forwards them to the matching screen.

**4. `src/styles.css`** — add `.dg-bubble__actions` (a wrapping flex row of small buttons that
sits inside the bubble and does not overflow it) and a compact confirmation treatment. Use the
existing tokens/vars and pastel design language; do not invent new colors.

**5. `src/index.ts`** — make sure `StatusUpdate`, `StatusPriority` and `BubbleStyle` are exported
(the coordinator imports them from `@diggy/ui`).

## Constraints

- No new runtime dependency. React 18 + existing primitives/Icon.
- **Additive only**: no existing export renamed or removed, no existing prop made required.
- `packages/ui` stays browser-agnostic — no `chrome`/`browser`, no `window.location` assumption
  beyond what is already there.
- Leave `src/app/sampleData.ts`'s empty collections alone.
- Match the existing style; no comments on self-evident code.

## Ownership

Yours: `packages/ui/**`.
Do **not** touch `apps/**` (the coordinator wires the side-panel entry).

## Observable acceptance

Run and report the exact output of:

```
pnpm --filter @diggy/ui typecheck
pnpm --filter @diggy/ui build
```

Both must be clean. Also state, in one line each, the exact prop names you added to `Dashboard`
and to each screen, so the coordinator can wire them without re-reading your diff.
