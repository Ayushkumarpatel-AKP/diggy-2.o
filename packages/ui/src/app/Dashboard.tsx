/**
 * DIGGY side-panel dashboard — sidebar + the 8 tabs + composer + command palette + status bubble.
 * This is the single surface the extension side panel, the pop-out window and the demo all
 * render, so what you review in `apps/demo` is exactly what ships.
 *
 * // INTERFACE FOR INTEGRATION
 * type ScreenState = "ready" | "loading" | "empty" | "error";
 * type ActionIntent = "summarize" | "explain" | "extract" | "repository" | "opportunities"
 *                   | "track" | "voice" | "ask";
 * interface DashboardProps {
 *   tab?: NavTabId;                       // controlled tab
 *   onTabChange?(id: NavTabId): void;
 *   user?: { initials: string; name?: string; role?: string };
 *   statusApi?: Pick<AvatarAPI, "status">; // consumes AvatarAPI.status
 *   onSettings?(): void;
 *   onAction?(intent: ActionIntent): void; // buttons → extension runtime
 *   onAsk?(text: string): void;            // composer → extension runtime answers
 *   onCommand?(label: string, intent?: string): void; // explicit screen intents go verbatim
 *   preview?: boolean;                     // sample data is labelled when true (default)
 *   screenStates?: Partial<Record<NavTabId, ScreenState>>;
 *   liveStatus?: { id: string; text: string; priority?: StatusPriority; style?: BubbleStyle;
 *     max?: number };
 *   pendingConfirmation?: PendingConfirmation;
 *   onStatusPush?: (push: (update: StatusUpdate) => void) => void;
 *   metrics?: MetricData[]; alerts?: AlertData[]; watches?: WatchRow[];
 *   events?: ActivityEvent[]; integrations?: IntegrationRow[];
 *   actions?: ActionLogRow[]; setup?: ApiKeysSetup;
 * }
 * function Dashboard(props: DashboardProps): JSX.Element;
 * // Intents forwarded verbatim (see RUNTIME_INTENTS): ask/summarize/explain/
 * // extract/repository/opportunities/track/voice/confirm/deny/setup.open/
 * // integration.connect/disconnect/vault.status/vault.lock/usage/state/
 * // chat.clear/watch.add/watch.check/watch.pause/watch.resume/watch.remove/
 * // watch.notify. Anything else keeps the legacy onAction mapping.
 * // END INTERFACE FOR INTEGRATION
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  NAV_TABS,
  type ActivityEvent,
  type AvatarAPI,
  type NavTabId,
  type ProfileSchema,
} from "@diggy/shared";

import { Icon, type IconName } from "../Icon.js";
import { Button } from "../primitives/Button.js";
import { Composer } from "../primitives/Composer.js";
import { StatusBubble, type ActionPreview } from "../primitives/StatusBubble.js";
import { useHotkey } from "../hooks/useHotkey.js";
import { usePopOut } from "../hooks/usePopOut.js";
import { useStatusQueue, type StatusUpdate } from "../hooks/useStatusQueue.js";
import { LONG_STATUS_MAX, type BubbleStyle, type StatusPriority } from "../hooks/statusQueue.js";
import { CommandPalette, type PaletteCommand } from "./CommandPalette.js";
import { Sidebar } from "./Sidebar.js";
import {
  sampleQuickCommands,
  sampleUser,
  type ActionLogRow,
  type AlertData,
  type IntegrationRow,
  type MetricData,
  type WatchRow,
} from "./sampleData.js";
import type { ScreenState } from "./ScreenState.js";
import { ActionsScreen } from "./screens/ActionsScreen.js";
import { ActivityScreen } from "./screens/ActivityScreen.js";
import { ApiKeysScreen, type ApiKeysSetup } from "./screens/ApiKeysScreen.js";
import { AssistantScreen } from "./screens/AssistantScreen.js";
import { HomeScreen } from "./screens/HomeScreen.js";
import { IntegrationsScreen } from "./screens/IntegrationsScreen.js";
import { MonitorScreen } from "./screens/MonitorScreen.js";
import { VaultScreen } from "./screens/VaultScreen.js";

export interface PendingConfirmation {
  id: string;
  title: string;
  detail?: string;
  confirmLabel?: string;
  denyLabel?: string;
  /** Present when the runtime broadcasts an ActionPreview-shaped approval. */
  kind?: ActionPreview["kind"];
  targetUrl?: string;
  thumbnailUrl?: string;
  onConfirm: () => void;
  onDeny?: () => void;
}

export interface LiveStatus {
  id: string;
  text: string;
  priority?: StatusPriority;
  style?: BubbleStyle;
  /** Clip to this many chars; defaults to the long-form cap (action lines need room). */
  max?: number;
}

export interface DashboardProps {
  tab?: NavTabId;
  onTabChange?: (id: NavTabId) => void;
  user?: { initials: string; name?: string; role?: string };
  statusApi?: Pick<AvatarAPI, "status">;
  onSettings?: () => void;
  /** Forwarded to the extension runtime so the buttons actually do the work. */
  onAction?: (intent: ActionIntent) => void;
  /** The composer sends typed text to the runtime, which answers it. */
  onAsk?: (text: string) => void;
  /**
   * Verbatim command channel to the extension runtime. When a screen supplies an
   * explicit `intent` that the runtime understands, `handleCommand` forwards
   * `(label, intent)` here unchanged instead of mapping the label. When absent,
   * the dashboard falls back to `onAction`/`onAsk` and local status lines, so
   * the static gallery keeps working with no runtime wired.
   */
  onCommand?: (label: string, intent?: string) => void;
  /** When true (default) sample rows are labelled as a preview. */
  preview?: boolean;
  /** Optional per-screen state so empty / loading / error are real, not implied. */
  screenStates?: Partial<Record<NavTabId, ScreenState>>;
  /** A background line pushed into the status bubble; a repeated `id` replaces the line. */
  liveStatus?: LiveStatus;
  /** When present the dock asks for approval instead of showing status. */
  pendingConfirmation?: PendingConfirmation;
  /** Called once on mount with the queue's `push`, for the background to drive status. */
  onStatusPush?: (push: (update: StatusUpdate) => void) => void;
  metrics?: MetricData[];
  alerts?: AlertData[];
  watches?: WatchRow[];
  events?: ActivityEvent[];
  integrations?: IntegrationRow[];
  /** Live action log, forwarded to the Actions screen (default `[]` there). */
  actions?: ActionLogRow[];
  /** Key-setup values, forwarded to the API Keys screen (absent = empty state). */
  setup?: ApiKeysSetup;
  /**
   * Vault state and handlers, forwarded straight to the Vault screen.
   *
   * The dashboard stays presentational: it never unlocks, creates or resolves a
   * vault itself — the host supplies these.
   */
  vault?: {
    status?: { exists: boolean; unlocked: boolean };
    profile?: ProfileSchema | null;
    onUnlock?: (passphrase: string) => void | Promise<void>;
    onCreate?: (passphrase: string) => void | Promise<void>;
    onLock?: () => void;
    autoLockAt?: number;
    /** Move one field between shared (DIGGY may read it) and locked (it must ask). */
    onToggleVisibility?: (key: string, visibility: "shared" | "locked") => void;
  };
}

/** High-level intents the dashboard forwards to the extension runtime. */
export type ActionIntent =
  | "summarize"
  | "explain"
  | "extract"
  | "repository"
  | "opportunities"
  | "track"
  | "voice"
  | "ask";

/** Exact intent sentinels the quick commands send — matched before any substring fallback,
 *  so `read.repo` (which contains none of the label keywords) still reaches the runtime. */
const INTENT_SENTINEL: Record<string, ActionIntent> = {
  "monitor.track": "track",
  "read.summarize": "summarize",
  "read.explain": "explain",
  "read.repo": "repository",
};

/**
 * Sentinels with no matching ActionIntent. `form.fill` is a page goal, not one of the
 * runtime's fixed intents, so it travels the ask channel as a goal sentence instead of
 * falling through to a local status line. The sentence names no submit — the agent fills
 * and the user presses Submit (product safety rule: never auto-submit).
 */
const GOAL_SENTINEL: Record<string, string> = {
  "form.fill": "Fill this form with my saved profile, without submitting.",
};

/**
 * Intent verbs the extension runtime understands. Screens send these verbatim
 * as the `intent` argument of `onCommand(label, intent)`; parameters travel
 * after a colon (`integration.connect:github`). Anything outside this set is
 * a legacy sentinel or a bare label and keeps the old `onAction` mapping.
 */
const RUNTIME_INTENTS = new Set([
  "ask",
  "summarize",
  "explain",
  "extract",
  "repository",
  "opportunities",
  "track",
  "voice",
  "confirm",
  "deny",
  "setup.open",
  "integration.connect",
  "integration.disconnect",
  "vault.status",
  "vault.lock",
  "usage",
  "state",
  "chat.clear",
  "watch.add",
  "watch.check",
  "watch.pause",
  "watch.resume",
  "watch.remove",
  "watch.notify",
]);

/** True when `intent` names a runtime verb, ignoring any `:parameter` suffix. */
function isRuntimeIntent(intent: string): boolean {
  const verb = intent.split(":")[0] ?? "";
  return RUNTIME_INTENTS.has(verb);
}

/** Map a button's label onto a runtime intent (`null` = local-only feedback). */
export function intentForLabel(label: string): ActionIntent | null {  const exact = INTENT_SENTINEL[label];
  if (exact) return exact;
  const value = label.toLowerCase();
  if (value.includes("summar")) return "summarize";
  if (value.includes("explain")) return "explain";
  if (value.includes("extract")) return "extract";
  if (value.includes("repositor")) return "repository";
  if (value.includes("opportunit")) return "opportunities";
  if (value.includes("track")) return "track";
  if (value.includes("voice") || value.includes("mic")) return "voice";
  return null;
}

export function Dashboard({
  tab,
  onTabChange,
  user,
  statusApi,
  onSettings,
  onAction,
  onAsk,
  onCommand,
  preview = true,
  screenStates,
  liveStatus,
  pendingConfirmation,
  onStatusPush,
  metrics,
  alerts,
  watches,
  events,
  integrations,
  actions,
  setup,
  vault,
}: DashboardProps) {
  const [internalTab, setInternalTab] = useState<NavTabId>("home");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const activeTab = tab ?? internalTab;
  const status = useStatusQueue();
  const popOut = usePopOut({ elementId: "dg-popout-root", width: 420, height: 760 });
  const onStatusPushRef = useRef(onStatusPush);

  useEffect(() => {
    onStatusPushRef.current?.(status.push);
  }, [status.push]);

  useEffect(() => {
    if (!liveStatus) return;
    status.push({
      id: liveStatus.id,
      text: liveStatus.text,
      priority: liveStatus.priority,
      style: liveStatus.style,
      // Action-describing lines get the long-form cap unless told otherwise.
      max: liveStatus.max ?? LONG_STATUS_MAX,
    });
  }, [liveStatus?.id, liveStatus?.text, liveStatus?.priority, liveStatus?.style, liveStatus?.max, status.push]);

  const stateFor = useCallback(
    (id: NavTabId): ScreenState => screenStates?.[id] ?? "ready",
    [screenStates],
  );

  const selectTab = useCallback(
    (id: NavTabId) => {
      if (tab === undefined) setInternalTab(id);
      onTabChange?.(id);
    },
    [tab, onTabChange],
  );

  const handleCommand = useCallback(
    (label: string, intent?: string) => {
      // An explicit runtime intent goes to the runtime verbatim — the label is
      // only context for it, never re-mapped. Everything without one keeps the
      // legacy path: goal sentinels ask, known labels map to an ActionIntent,
      // and the rest is a local acknowledgement (never a dead click).
      if (intent && isRuntimeIntent(intent) && onCommand) {
        onCommand(label, intent);
        return;
      }
      // Real work goes to the runtime; everything else is a local acknowledgement.
      // A goal sentinel (e.g. `form.fill`) has no fixed intent, so it asks the runtime
      // with a goal sentence over the existing `ask` channel — no new intents invented.
      if (intent) {
        const goal = GOAL_SENTINEL[intent];
        if (goal && onAsk) {
          onAsk(goal);
          return;
        }
      }
      const action = intentForLabel(intent ?? label);
      if (action && onAction) {
        onAction(action);
        return;
      }
      status.push({ text: intent ? `${label} · ${intent}` : label, priority: 1, mood: "thinking" });
    },
    [status, onAction, onAsk, onCommand],
  );

  const handleAsk = useCallback(
    (text: string) => {
      const clean = text.trim();
      if (!clean) return;
      setDraft("");
      if (onAsk) {
        onAsk(clean);
        return;
      }
      // No runtime wired (e.g. the static gallery) — still acknowledge, never a dead click.
      status.push({ text: `You asked: ${clean}`, priority: 1, mood: "thinking" });
    },
    [onAsk, status],
  );

  useHotkey("alt+k", () => setPaletteOpen((open) => !open));
  useHotkey("alt+space", () => {
    void popOut.popOut();
  });

  const commands = useMemo<PaletteCommand[]>(
    () => [
      ...NAV_TABS.map((item) => ({
        id: `nav_${item.id}`,
        label: `Go to ${item.label}`,
        group: "Navigate",
        icon: item.icon as IconName,
        run: () => selectTab(item.id),
      })),
      ...sampleQuickCommands.map((command) => ({
        id: `cmd_${command.id}`,
        label: command.label,
        group: "Quick Commands",
        icon: command.icon,
        hint: "⏎",
        run: () => handleCommand(command.label, command.intent),
      })),
      {
        id: "popout",
        label: popOut.isOpen ? "Close pop-out panel" : "Pop out panel",
        group: "View",
        icon: "popout",
        hint: "Alt+Space",
        run: () => {
          if (popOut.isOpen) popOut.close();
          else void popOut.popOut();
        },
      },
    ],
    [selectTab, handleCommand, popOut],
  );

  return (
    <div className="dg-root" id="dg-popout-root">
      <div className="dg-shell">
        <Sidebar
          active={activeTab}
          onSelect={selectTab}
          user={user ?? sampleUser}
          onSettings={onSettings}
          footer={
            <button
              type="button"
              className="dg-btn dg-btn--ghost dg-btn--sm"
              onClick={() => (popOut.isOpen ? popOut.close() : void popOut.popOut())}
              style={{ justifyContent: "flex-start" }}
            >
              <Icon name="popout" size={15} />
              {popOut.isOpen ? "Close pop-out" : "Pop out panel"}
            </button>
          }
        />

        <main className="dg-main">
          {/* Narrow surfaces (a real browser side panel) hide the sidebar, so the
              section switcher becomes a scrollable, sticky tab strip instead. */}
          <nav className="dg-tabbar" aria-label="Sections">
            {NAV_TABS.map((item) => {
              const isActive = item.id === activeTab;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={isActive ? "dg-tab dg-tab--active" : "dg-tab"}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => selectTab(item.id)}
                >
                  <Icon name={item.icon as IconName} size={15} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="dg-content">
            {activeTab === "home" ? (
              <HomeScreen
                onNavigate={selectTab}
                onOpenPalette={() => setPaletteOpen(true)}
                onCommand={handleCommand}
                state={stateFor("home")}
                preview={preview}
                metrics={metrics}
                alerts={alerts}
              />
            ) : null}
            {activeTab === "assistant" ? (
              <AssistantScreen
                onCommand={handleCommand}
                state={stateFor("assistant")}
                preview={preview}
              />
            ) : null}
            {activeTab === "monitor" ? (
              <MonitorScreen
                onCommand={handleCommand}
                state={stateFor("monitor")}
                preview={preview}
                watches={watches}
              />
            ) : null}
            {activeTab === "actions" ? (
              <ActionsScreen
                onCommand={handleCommand}
                state={stateFor("actions")}
                preview={preview}
                {...(actions !== undefined ? { actions } : {})}
              />
            ) : null}
            {activeTab === "integrations" ? (
              <IntegrationsScreen
                onCommand={handleCommand}
                state={stateFor("integrations")}
                preview={preview}
                integrations={integrations}
              />
            ) : null}
            {activeTab === "vault" ? (
              <VaultScreen
                onCommand={handleCommand}
                state={stateFor("vault")}
                preview={preview}
                {...(vault ?? {})}
              />
            ) : null}
            {activeTab === "activity" ? (
              <ActivityScreen
                onCommand={handleCommand}
                state={stateFor("activity")}
                preview={preview}
                events={events}
              />
            ) : null}
            {activeTab === "apikeys" ? (
              <ApiKeysScreen
                onCommand={handleCommand}
                state={stateFor("apikeys")}
                preview={preview}
                {...(setup !== undefined ? { setup } : {})}
              />
            ) : null}
          </div>

          <div className="dg-composer-dock">
            <Composer
              value={draft}
              onChange={setDraft}
              onSend={handleAsk}
              onVoice={onAction ? () => onAction("voice") : undefined}
            />
          </div>
        </main>
      </div>

      <div className={pendingConfirmation ? "dg-statusdock dg-statusdock--confirm" : "dg-statusdock"}>
        {pendingConfirmation ? (
          <StatusBubble
            text={pendingConfirmation.title}
            priority={2}
            variant="speech"
            typing={false}
            api={statusApi}
            {...(pendingConfirmation.kind
              ? {
                  preview: {
                    id: pendingConfirmation.id,
                    kind: pendingConfirmation.kind,
                    title: pendingConfirmation.title,
                    ...(pendingConfirmation.detail !== undefined
                      ? { detail: pendingConfirmation.detail }
                      : {}),
                    ...(pendingConfirmation.targetUrl !== undefined
                      ? { targetUrl: pendingConfirmation.targetUrl }
                      : {}),
                    ...(pendingConfirmation.thumbnailUrl !== undefined
                      ? { thumbnailUrl: pendingConfirmation.thumbnailUrl }
                      : {}),
                    ...(pendingConfirmation.confirmLabel !== undefined
                      ? { confirmLabel: pendingConfirmation.confirmLabel }
                      : {}),
                    ...(pendingConfirmation.denyLabel !== undefined
                      ? { denyLabel: pendingConfirmation.denyLabel }
                      : {}),
                  } satisfies ActionPreview,
                  onApprove: pendingConfirmation.onConfirm,
                  ...(pendingConfirmation.onDeny !== undefined
                    ? { onDeny: pendingConfirmation.onDeny }
                    : {}),
                }
              : {
                  actions: (
                    <>
                      {pendingConfirmation.detail ? (
                        <span className="dg-bubble__detail">{pendingConfirmation.detail}</span>
                      ) : null}
                      <Button variant="primary" size="sm" onClick={pendingConfirmation.onConfirm}>
                        {pendingConfirmation.confirmLabel ?? "Approve"}
                      </Button>
                      {pendingConfirmation.onDeny ? (
                        <Button variant="ghost" size="sm" onClick={pendingConfirmation.onDeny}>
                          {pendingConfirmation.denyLabel ?? "Cancel"}
                        </Button>
                      ) : null}
                    </>
                  ),
                })}
          />
        ) : null}
        {status.current?.text ? (
          <StatusBubble
            text={status.current.text}
            priority={status.current?.priority ?? 0}
            variant={status.current?.style ?? "thought"}
            collapsed={status.collapsed}
            onToggleCollapse={status.toggleCollapse}
            api={statusApi}
          />
        ) : null}
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={commands}
      />
    </div>
  );
}
