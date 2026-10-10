# Wave 8 — the bubble can show things, and the bell becomes real

Two workers on disjoint files, plus the coordinator on the runtime.

Read `agents/wave5/README.md` first for the shared conventions (ESM, strict TS,
`.js` relative imports, vitest, no `chrome` in `packages/ui`, `TURBO_CONCURRENCY=2`,
`NODE_ENV=production` for extension builds, 5.9 GB RAM — never two installs at once).

## Audit findings this wave fixes

- `StatusBubble` renders a plain string truncated to **68 chars**. There is **no `<img>`,
  no thumbnail, no card** anywhere in `packages/ui` (grep for image/thumbnail/img returns only
  icon `role="img"`). So an approval cannot show what it is approving.
- There is **no menu/dropdown/popover primitive at all** — grep for
  `menu|dropdown|popover|aria-haspopup` in `packages/ui` returns **zero matches**. The
  three-dot icons fire a single `onCommand` string and no menu ever opens.
- There is **no notification model**: no store, no unread count, no panel. OS notifications
  exist separately in `packages/monitor/src/notify.ts`; they are not a UI.
- **Nothing records agent actions.** `packages/activity/src/bridge.ts` already listens for
  `action.executed`, `form.filled`, `action.summary`, `action.read`, but nothing in the
  extension emits them — so the Actions screen is permanently empty.
- Monitor has **no start/stop/refresh/delete controls**; its Websites/GitHub/Others tabs
  hard-code `[]` for the last two; `toWatchRow` forces `active: true`.

## Ownership

| Worker | Owns |
|---|---|
| **coordinator** | `apps/extension/**`, `packages/shared/src/contracts/nav.ts` |
| **w8-parts** | NEW files only: `packages/ui/src/primitives/ActionCard.tsx`, `packages/ui/src/primitives/Menu.tsx`, `packages/ui/src/hooks/useNotifications.ts`, `packages/ui/src/primitives/NotificationPanel.tsx`, plus one new test file each |
| **w8-screens** | `packages/ui/src/app/Dashboard.tsx`, `packages/ui/src/app/screens/*.tsx`, `packages/ui/src/primitives/StatusBubble.tsx`, `packages/ui/src/hooks/{statusQueue,useStatusQueue}.ts`, `packages/ui/src/Icon.tsx`, `packages/ui/src/index.ts` |

Both of you may need `index.ts`. **w8-screens owns it** and must add the export lines for
w8-parts' files by path (they will exist after both merge). If you need an export the other
worker owns, add it and say so in `worker_done` — do not edit their file.

## Frozen interface (the coordinator emits this)

```ts
// The confirmation the runtime broadcasts. `kind` decides which preview to show.
export interface ActionPreview {
  id: string;
  kind: "submit" | "vault" | "navigate" | "openVideo" | "connect";
  title: string;
  detail?: string;
  targetUrl?: string;
  thumbnailUrl?: string;
  confirmLabel?: string;
  denyLabel?: string;
}
```

```ts
// w8-parts owns these signatures
export function ActionCard(props: {
  preview: ActionPreview;
  status?: "idle" | "running" | "failed";
  error?: string;
  onApprove(): void;
  onDeny?(): void;
}): JSX.Element;

export function Menu(props: {
  label: string;
  items: { id: string; label: string; onSelect(): void; danger?: boolean }[];
  align?: "left" | "right";
}): JSX.Element;

export interface AppNotification {
  id: string; kind: "reminder" | "alert" | "approval" | "integration" | "error";
  title: string; detail?: string; at: number; read: boolean;
}
export function useNotifications(): {
  items: AppNotification[]; unread: number;
  push(n: Omit<AppNotification, "id" | "at" | "read">): void;
  markRead(id: string): void; markAllRead(): void; clear(): void;
};
```

## Reporting

`worker_done` with `--outcome`, exact commands and real output, and the signatures you
settled on. Do not commit and do not push.
