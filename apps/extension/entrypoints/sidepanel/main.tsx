/**
 * Side panel entrypoint — the real 7-tab DIGGY dashboard.
 *
 * The dashboard is presentational. Every button and every composer send is
 * forwarded to the extension runtime on one channel (`diggy:command`), and the
 * panel listens back for two things the runtime pushes while a command runs:
 *
 * - `diggy:progress` — one line per step, keyed by a stable id so each step
 *   replaces the previous line in the thinking bubble instead of queueing.
 * - `diggy:confirmation` — the submit offer. The runtime fills forms but never
 *   submits; this panel is where the user presses the button, and that press is
 *   what sends `intent: "confirm"`.
 */
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { ActionCard, Dashboard, SetupPanel, type IntegrationRow, type WatchRow } from "../../../../packages/ui/src/index.js";
import type { BubbleStyle, StatusPriority } from "../../../../packages/ui/src/index.js";
import { PROVIDER_PRESETS } from "../../src/provider-settings.js";
import type { ActivityEvent, WatchSpec } from "@diggy/shared";
import "../../../../packages/ui/src/styles.css";
import "../../assets/app.css";

/** Storage keys the SetupPanel edits. Kept identical to provider-settings.ts. */
const KEYS = {
  primary: "diggy:providers",
  fallback: "diggy:providers:fallback",
  search: "diggy:search",
} as const;

interface SetupValues {
  primary: { presetId: string; apiKey: string; baseUrl: string; model: string };
  fallback: { enabled: boolean; presetId: string; apiKey: string; baseUrl: string; model: string };
  search: { tavilyKey: string; preferLocal: boolean };
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/** Read the three credential blobs. Never logs a value. */
async function loadSetup(): Promise<SetupValues> {
  const fallbackPreset = PROVIDER_PRESETS[1] ?? PROVIDER_PRESETS[0]!;
  const base: SetupValues = {
    primary: { presetId: PROVIDER_PRESETS[0]!.id, apiKey: "", baseUrl: "", model: "" },
    fallback: {
      enabled: false,
      presetId: fallbackPreset.id,
      apiKey: "",
      baseUrl: fallbackPreset.baseUrl,
      model: fallbackPreset.model,
    },
    search: { tavilyKey: "", preferLocal: false },
  };
  try {
    const stored = (await browser.storage.local.get([
      KEYS.primary,
      KEYS.fallback,
      KEYS.search,
    ])) as Record<string, unknown>;

    const p = (stored[KEYS.primary] ?? {}) as Record<string, unknown>;
    base.primary = {
      presetId: text(p["presetId"], base.primary.presetId),
      apiKey: text(p["apiKey"]),
      baseUrl: text(p["baseUrl"], PROVIDER_PRESETS[0]!.baseUrl),
      model: text(p["model"], PROVIDER_PRESETS[0]!.model),
    };

    const f = (stored[KEYS.fallback] ?? {}) as Record<string, unknown>;
    base.fallback = {
      enabled: typeof f["apiKey"] === "string" && f["apiKey"] !== "",
      presetId: text(f["presetId"], base.fallback.presetId),
      apiKey: text(f["apiKey"]),
      baseUrl: text(f["baseUrl"], base.fallback.baseUrl),
      model: text(f["model"], base.fallback.model),
    };

    const s = (stored[KEYS.search] ?? {}) as Record<string, unknown>;
    base.search = {
      tavilyKey: text(s["tavilyKey"]),
      preferLocal: s["preferLocal"] === true,
    };
  } catch {
    /* first run: the defaults above are already honest */
  }
  return base;
}

interface LiveStatus {
  id: string;
  text: string;
  priority?: StatusPriority;
  style?: BubbleStyle;
}

interface Confirmation {
  id: string;
  title: string;
  detail?: string;
  confirmLabel?: string;
  denyLabel?: string;
}

/** The one snapshot the background broadcasts — see `broadcastState`. */
interface AppState {
  vault?: { exists: boolean; unlocked: boolean };
  /** Present only while the vault is unlocked. */
  vaultProfile?: Record<string, unknown>;
  watches?: { id: string; url: string; kind: string; intervalSec: number }[];
  reminders?: { id: string; title: string; dueAt: number; done: boolean }[];
  usage?: string;
  events?: ActivityEvent[];
  integrations?: { id: string; name: string; category: string; status: string }[];
}

/**
 * Brand colours and monograms for the connector catalogue.
 *
 * Kept here rather than in the background so the runtime never needs to know how
 * a service is presented; the screen still owns the tile.
 */
const BRAND: Record<string, { color: string; mark: string }> = {
  google: { color: "#4285F4", mark: "G" },
  github: { color: "#24292F", mark: "GH" },
  notion: { color: "#111111", mark: "N" },
  youtube: { color: "#FF0033", mark: "▶" },
  slack: { color: "#4A154B", mark: "S" },
  discord: { color: "#5865F2", mark: "D" },
  linear: { color: "#5E6AD2", mark: "L" },
  spotify: { color: "#1DB954", mark: "♫" },
};

function toIntegrationRow(row: {
  id: string;
  name: string;
  category: string;
  status: string;
}): IntegrationRow {
  const brand = BRAND[row.id] ?? { color: "#737373", mark: row.name.slice(0, 2) };
  const connected = row.status === "connected";
  return {
    id: row.id,
    name: row.name,
    category: (row.category === "Development" || row.category === "Social"
      ? row.category
      : "Productivity") as IntegrationRow["category"],
    color: brand.color,
    mark: brand.mark,
    status: connected ? "connected" : "connect",
  };
}

/** The one channel from the panel to the runtime. */
function send(message: Record<string, unknown>): void {
  void browser.runtime.sendMessage({ type: "diggy:command", ...message }).catch(() => undefined);
}

/** The kinds the monitor actually accepts. */
const WATCH_KINDS = new Set([
  "content_change",
  "keyword",
  "new_post",
  "registration_open",
  "deadline_change",
  "release_published",
  "price_change",
  "custom",
]);

/** The background sends a plain spec; the screen wants a display row. */
function toWatchRow(spec: { id: string; url: string; kind: string; intervalSec: number }): WatchRow {
  let name = spec.url;
  try {
    name = new URL(spec.url).host.replace(/^www\./, "");
  } catch {
    /* keep the raw url when it will not parse */
  }
  return {
    spec: {
      id: spec.id,
      url: spec.url,
      kind: (WATCH_KINDS.has(spec.kind) ? spec.kind : "content_change") as WatchSpec["kind"],
      intervalSec: spec.intervalSec,
      createdAt: 0,
    },
    name,
    tags: [spec.kind.replace(/_/g, " ")],
    active: true,
  };
}

function SidePanel() {
  const [liveStatus, setLiveStatus] = useState<LiveStatus | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [state, setState] = useState<AppState>({});

  // The in-panel setup form. Keys are edited here, never on the options page.
  const [setupOpen, setSetupOpen] = useState(false);
  const [setup, setSetup] = useState<SetupValues | null>(null);
  const [setupStatus, setSetupStatus] = useState<string | undefined>(undefined);
  /** The last result worth showing as a card (a link, a video, a page). */
  const [card, setCard] = useState<{
    title: string;
    detail?: string;
    targetUrl?: string;
    thumbnailUrl?: string;
  } | null>(null);

  // Loaded on mount, not only when the overlay opens: the API Keys *screen* reads
  // the same state, and without it that tab rendered its empty state forever.
  useEffect(() => {
    void loadSetup().then(setSetup);
  }, []);

  useEffect(() => {
    if (setupOpen) void loadSetup().then(setSetup);
  }, [setupOpen]);

  /** Write the three blobs. A disabled fallback is removed rather than stored empty. */
  async function saveSetup(values: SetupValues): Promise<void> {
    try {
      await browser.storage.local.set({
        [KEYS.primary]: values.primary,
        [KEYS.search]: values.search,
      });
      if (values.fallback.enabled) {
        await browser.storage.local.set({
          [KEYS.fallback]: {
            presetId: values.fallback.presetId,
            apiKey: values.fallback.apiKey,
            baseUrl: values.fallback.baseUrl,
            model: values.fallback.model,
          },
        });
      } else {
        await browser.storage.local.remove(KEYS.fallback);
      }
      setSetupStatus("Saved — the runtime picks this up on your next command.");
    } catch (error) {
      setSetupStatus(`Could not save: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  useEffect(() => {
    const onMessage = (raw: unknown): undefined => {
      const message = raw as
        | {
            type?: string;
            id?: string;
            text?: string;
            priority?: number;
            style?: string;
            confirmation?: Confirmation | null;
            state?: AppState;
            vaultProfile?: Record<string, unknown>;
            card?: {
              title: string;
              detail?: string;
              targetUrl?: string;
              thumbnailUrl?: string;
            } | null;
          }
        | undefined;
      if (!message) return undefined;

      if (message.type === "diggy:progress" && typeof message.text === "string") {
        const next: LiveStatus = { id: message.id ?? "run", text: message.text };
        if (message.priority === 0 || message.priority === 1 || message.priority === 2 || message.priority === 3) {
          next.priority = message.priority;
        }
        if (message.style === "thought" || message.style === "speech") next.style = message.style;
        setLiveStatus(next);
      }

      if (message.type === "diggy:confirmation") {
        setConfirmation(message.confirmation ?? null);
      }

      // The shared snapshot: vault state, watches, reminders, spend.
      if (message.type === "diggy:state" && message.state) {
        setState(message.state);
      }

      // The runtime asked for the setup form (a button, or the model telling the
      // user where to paste a key).
      if (message.type === "diggy:setup") {
        setSetupOpen(true);
      }

      // A result worth showing: an answer that points somewhere gets a card with
      // its host, its text and — for a video — its thumbnail.
      if (message.type === "diggy:card") {
        setCard(message.card ?? null);
      }
      return undefined;
    };

    browser.runtime.onMessage.addListener(onMessage);
    // Ask for a snapshot on open — the panel may have opened after a change.
    send({ intent: "state" });
    return () => browser.runtime.onMessage.removeListener(onMessage);
  }, []);

  return (
    <>
      <Dashboard
      onSettings={() => {
        // The in-panel setup form, not the options page — that is the whole point
        // of this change.
        setSetupOpen(true);
      }}
      /*
       * This is live data, not the design gallery: without this the panel shows a
       * "Preview data" badge in production even when every value is real.
       */
      preview={false}
      onAction={(intent) => send({ intent })}
      onAsk={(text) => send({ intent: "ask", text })}
      /*
       * Without this, every screen's explicit intent was re-mapped by substring
       * matching and most fell through to a local status line — which is why the
       * Integrations, Actions and Monitor buttons looked dead. The label rides
       * along as `text` so the runtime can name the thing being acted on.
       */
      onCommand={(label, intent) => send({ ...(intent ? { intent } : {}), text: label })}
      {...(liveStatus ? { liveStatus } : {})}
      {...(state.watches ? { watches: state.watches.map(toWatchRow) } : {})}
      {...(state.events ? { events: state.events } : {})}
      {...(state.integrations ? { integrations: state.integrations.map(toIntegrationRow) } : {})}
      {...(setup
        ? {
            setup: {
              primary: setup.primary,
              fallback: setup.fallback,
              search: setup.search,
              presets: PROVIDER_PRESETS.map((preset) => ({
                id: preset.id,
                label: preset.label,
                baseUrl: preset.baseUrl,
                model: preset.model,
                sttModel: preset.sttModel,
                needsKey: preset.needsKey,
              })),
              onSave: saveSetup,
              ...(setupStatus !== undefined ? { status: setupStatus } : {}),
            },
          }
        : {})}
      vault={{
        ...(state.vault ? { status: state.vault } : {}),
        // Without the profile the screen unlocks into an empty page.
        ...(state.vaultProfile ? { profile: state.vaultProfile } : {}),
        onToggleVisibility: (key: string, visibility: string) => {
          send({ intent: "vault.visibility", text: `${key}:${visibility}` });
        },
        onUnlock: (passphrase) => {
          send({ intent: "vault.unlock", text: passphrase });
        },
        onLock: () => {
          send({ intent: "vault.lock" });
        },
        onCreate: (passphrase) => {
          send({ intent: "vault.create", text: passphrase });
        },
      }}
      {...(confirmation
        ? {
            pendingConfirmation: {
              id: confirmation.id,
              title: confirmation.title,
              ...(confirmation.detail !== undefined ? { detail: confirmation.detail } : {}),
              ...(confirmation.confirmLabel !== undefined
                ? { confirmLabel: confirmation.confirmLabel }
                : {}),
              ...(confirmation.denyLabel !== undefined ? { denyLabel: confirmation.denyLabel } : {}),
              onConfirm: () => {
                send({ intent: "confirm", confirmationId: confirmation.id });
                setConfirmation(null);
              },
              onDeny: () => {
                send({ intent: "deny", confirmationId: confirmation.id });
                setConfirmation(null);
              },
            },
          }
        : {})}
      />
      {setupOpen && setup ? (
        <SetupPanel
          primary={setup.primary}
          fallback={setup.fallback}
          search={setup.search}
          presets={PROVIDER_PRESETS.map((preset) => ({
            id: preset.id,
            label: preset.label,
            baseUrl: preset.baseUrl,
            model: preset.model,
            sttModel: preset.sttModel,
            needsKey: preset.needsKey,
          }))}
          onSave={saveSetup}
          {...(setupStatus !== undefined ? { status: setupStatus } : {})}
          onClose={() => setSetupOpen(false)}
        />
      ) : null}
      {card ? (
        <div className="dg-carddock">
          <ActionCard
            preview={{
              id: "result-card",
              kind: "navigate",
              title: card.title,
              ...(card.detail !== undefined ? { detail: card.detail } : {}),
              ...(card.targetUrl !== undefined ? { targetUrl: card.targetUrl } : {}),
              ...(card.thumbnailUrl !== undefined ? { thumbnailUrl: card.thumbnailUrl } : {}),
              confirmLabel: "Open",
              denyLabel: "Dismiss",
            }}
            onApprove={() => {
              const target = card.targetUrl;
              setCard(null);
              if (target) send({ intent: "ask", text: `Open ${target}` });
            }}
            onDeny={() => setCard(null)}
          />
        </div>
      ) : null}
    </>
  );
}

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(<SidePanel />);
}
