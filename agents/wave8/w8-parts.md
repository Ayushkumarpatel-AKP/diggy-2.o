# w8-parts — ActionCard, Menu, notifications

Read `agents/wave8/README.md` first (it has the frozen interfaces).

## Target

**New files only.** Do not edit any existing file:
- `packages/ui/src/primitives/ActionCard.tsx`
- `packages/ui/src/primitives/Menu.tsx`
- `packages/ui/src/hooks/useNotifications.ts`
- `packages/ui/src/primitives/NotificationPanel.tsx`
- one test file per component/hook

## Change

**1. `ActionCard`** — the "ChatGPT-like action preview" the spec asks for, built to the frozen
`ActionPreview` interface. It shows: the title, the `detail`, the **host** of `targetUrl` (not the
raw URL — show `youtube.com`, not a 200-char link), a **thumbnail** when `thumbnailUrl` is present
(`<img>` with `loading="lazy"`, `referrerPolicy="no-referrer"`, a fixed aspect box, and a graceful
fallback when the image fails), and Approve / Deny buttons. While `status === "running"` the
Approve button is disabled and shows progress; on `"failed"` render the `error` in place with a
retry affordance. Approve is the primary action; Deny is ghost.

**2. `Menu`** — an anchored popover. This is the first menu in the repo, so it needs to be correct:
`role="menu"` on the list, `aria-haspopup="menu"` + `aria-expanded` on the trigger, items with
`role="menuitem"`, **Escape** closes, **outside click** closes, **ArrowUp/ArrowDown** move focus,
**Enter** selects, and focus returns to the trigger on close. Model the keyboard handling on
`packages/ui/src/app/CommandPalette.tsx`. A trigger is a `Button`/`IconButton`; position the panel
under it, right-aligned when `align="right"`, and make sure it is not clipped inside a 400px panel.

**3. `useNotifications`** — to the frozen interface. A bounded in-memory list (cap ~50, newest
first), unread count, mark-read / mark-all-read, clear. No storage, no `chrome` — the hook is
presentational; the host pushes into it.

**4. `NotificationPanel`** — renders `items` grouped by recency, each row with its kind icon,
title, detail, relative time (reuse `formatRelative` from `../app/format.js`) and an unread dot.
An empty state that explains what will appear here. A "Mark all read" control and a per-row mark-read.

## Constraints

- Reuse existing primitives (`Button`, `IconButton`, `Pill`, `Panel`, `Icon`) and the `var(--dg-*)`
  tokens. No new dependency.
- `packages/ui` stays browser-agnostic: no `chrome`/`browser`/`fetch`.
- Nothing may render as an enabled control with no handler.
- Must be usable at 320–560px wide.
- If a raw URL would be displayed, show its host instead.

## Observable acceptance

```
pnpm --filter @diggy/ui typecheck
pnpm --filter @diggy/ui test
pnpm --filter @diggy/ui build
```

All clean. Tests must cover: ActionCard shows the host and not the full URL, and Deny does not
call `onApprove`; Menu closes on Escape and outside click and moves focus with arrow keys;
`useNotifications` counts unread and marks read. Report the final signatures.
