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

import { Dashboard, SetupPanel, runStateLabel, runStateTone, stepSummary, type IntegrationRow, type WatchRow } from "../../../../packages/ui/src/index.js";
import type { BubbleStyle, StatusPriority } from "../../../../packages/ui/src/index.js";
import { PROVIDER_PRESETS } from "../../src/provider-settings.js";
import type { ActivityEvent, RunView, WatchSpec } from "@diggy/shared";
import type { ChatTurn } from "../../src/chat-history.js";
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

/** The one snapshot the background broadcasts — see `broadcastState`. */
interface AppState {
  vault?: { exists: boolean; unlocked: boolean };
  /** Present only while the vault is unlocked. */
  vaultProfile?: Record<string, unknown>;
  watches?: { id: string; url: string; kind: string; intervalSec: number }[];
  reminders?: { id: string; title: string; dueAt: number; done: boolean }[];
  usage?: string;
  /** The user's open tabs, as the agent sees them. */
  tabs?: { id: number; url: string; title: string; active: boolean }[];
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
  const [state, setState] = useState<AppState>({});
  /** The live run's task state + steps, so the panel shows real progress. */
  const [run, setRun] = useState<RunView | null>(null);
  /** The conversation so far. */
  const [turns, setTurns] = useState<ChatTurn[]>([]);

  // The in-panel setup form. Keys are edited here, never on the options page.
  const [setupOpen, setSetupOpen] = useState(false);
  const [setup, setSetup] = useState<SetupValues | null>(null);
  const [setupStatus, setSetupStatus] = useState<string | undefined>(undefined);

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
            state?: AppState;
            vaultProfile?: Record<string, unknown>;
            run?: RunView | null;
            turns?: ChatTurn[];
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

      // The live task state and its steps.
      if (message.type === "diggy:run") {
        setRun(message.run ?? null);
      }

      // The conversation, so the panel renders a real chat.
      if (message.type === "diggy:chat") {
        setTurns(message.turns ?? []);
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
      return undefined;
    };

    browser.runtime.onMessage.addListener(onMessage);
    // Ask for a snapshot on open — the panel may have opened after a change.
    send({ intent: "state" });
    send({ intent: "chat" });
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
        onToggleVisibility: (key: string, visibility: "shared" | "locked") => {
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
      />
      {run ? (
        <div
          style={{
            position: "fixed",
            left: 12,
            right: 12,
            bottom: 12,
            background: "rgba(28,28,30,.96)",
            color: "#fff",
            borderRadius: 12,
            padding: "10px 12px",
            font: "12px/1.5 system-ui,sans-serif",
            boxShadow: "0 8px 24px rgba(0,0,0,.35)",
            maxHeight: "42vh",
            overflow: "auto",
            zIndex: 20,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: "50%",
                background:
                  runStateTone(run.state) === "success"
                    ? "#3fb950"
                    : runStateTone(run.state) === "danger"
                      ? "#f85149"
                      : runStateTone(run.state) === "warning"
                        ? "#d29922"
                        : runStateTone(run.state) === "muted"
                          ? "#8b949e"
                          : "#e0a63a",
              }}
            />
            <span style={{ fontWeight: 600 }}>{runStateLabel(run.state)}</span>
            <span style={{ opacity: 0.7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {run.goal}
            </span>
          </div>
          {run.plan && run.plan.length > 0 ? (
            <ol style={{ margin: "4px 0 8px 18px", opacity: 0.75 }}>
              {run.plan.map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ol>
          ) : null}
          {run.steps.length > 0 ? (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {run.steps.map((step) => (
                <li key={step.index} style={{ opacity: step.ok === false ? 0.6 : 1 }}>
                  {stepSummary(step)}
                </li>
              ))}
            </ul>
          ) : null}
          {run.text ? <p style={{ margin: "6px 0 0", opacity: 0.9 }}>{run.text}</p> : null}
        </div>
      ) : turns.length > 0 ? (
        <div
          style={{
            position: "fixed",
            left: 12,
            right: 12,
            bottom: 12,
            background: "rgba(28,28,30,.94)",
            color: "#fff",
            borderRadius: 12,
            padding: "10px 12px",
            font: "12px/1.5 system-ui,sans-serif",
            boxShadow: "0 8px 24px rgba(0,0,0,.35)",
            maxHeight: "36vh",
            overflow: "auto",
            zIndex: 20,
          }}
        >
          {turns.slice(-6).map((turn, index) => (
            <div key={index} style={{ margin: "2px 0", opacity: turn.role === "assistant" ? 0.85 : 1 }}>
              <b>{turn.role === "user" ? "You" : "DIGGY"}:</b> {turn.content}
            </div>
          ))}
        </div>
      ) : null}
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
      {!(run || turns.length > 0) && !setupOpen ? (
        <div
          style={{
            position: "fixed",
            left: 12,
            right: 12,
            bottom: 12,
            background: "rgba(28,28,30,.96)",
            color: "#fff",
            borderRadius: 12,
            padding: "10px 12px",
            font: "12px/1.5 system-ui,sans-serif",
            boxShadow: "0 8px 24px rgba(0,0,0,.35)",
            textAlign: "center",
            zIndex: 20,
            cursor: "pointer",
            maxHeight: "4vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => setSetupOpen(true)}
        >
          <span style={{ fontSize: 24, marginRight: 8 }}>🤖</span>
          <span>DIGGY</span>
        </div>
      ) : null}
    </>
  );
}

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(<SidePanel />);
}
