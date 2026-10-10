# Wave 7 — sidebar keys, and panels that work

Two workers, disjoint files, plus the coordinator wiring the runtime side.

Context: the user reports that (a) the Integrations and Actions panels look dead —
"I don't understand how it works", and (b) they do not want to open the extension
options page to paste keys; it must be in the side panel, secure.

Read `agents/wave5/README.md` first for the shared conventions (ESM, strict TS,
`.js` relative imports, vitest, no `chrome` outside `apps/extension`,
`TURBO_CONCURRENCY=2`, `NODE_ENV=production` for extension builds, 5.9 GB RAM).

## Ownership

| Worker | Owns | Does not touch |
|---|---|---|
| **coordinator** | `apps/extension/entrypoints/{background,content,sidepanel/main}.tsx`, `apps/extension/src/**` | `packages/ui/**` |
| **w7-panels** | `packages/ui/src/app/screens/{IntegrationsScreen,ActionsScreen,MonitorScreen}.tsx`, `packages/ui/src/app/Dashboard.tsx` | everything else, incl. `packages/ui/src/index.ts` |
| **w7-keys** | `packages/ui/src/app/SetupPanel.tsx` (new) | everything else, incl. `Dashboard.tsx` and `index.ts` |

## Frozen interfaces

```ts
// w7-keys owns this component; the coordinator mounts it in sidepanel/main.tsx
export interface SetupPanelProps {
  /** Current values, never a masked placeholder — the real string, or "". */
  primary: { presetId: string; apiKey: string; baseUrl: string; model: string };
  fallback: { enabled: boolean; presetId: string; apiKey: string; baseUrl: string; model: string };
  search: { tavilyKey: string; preferLocal: boolean };
  /** Preset catalogue to populate the selects. */
  presets: { id: string; label: string; baseUrl: string; model: string; sttModel: string; needsKey: boolean }[];
  onSave(values: {
    primary: { presetId: string; apiKey: string; baseUrl: string; model: string };
    fallback: { enabled: boolean; presetId: string; apiKey: string; baseUrl: string; model: string };
    search: { tavilyKey: string; preferLocal: boolean };
  }): void | Promise<void>;
  /** Result of the last save, e.g. "Saved" or an error. */
  status?: string;
  onClose?: () => void;
}
export function SetupPanel(props: SetupPanelProps): JSX.Element;
```

```ts
// Existing shapes the coordinator already sends; do not change them.
DashboardProps.watches?: WatchRow[];
DashboardProps.integrations?: IntegrationRow[];
DashboardProps.onCommand?: (label: string, intent?: string) => void;
```

## Reporting

`worker_done` with `--outcome`, the exact commands and their real output, and the
exported props you settled on. Do not commit and do not push.
