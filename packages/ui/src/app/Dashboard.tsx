/**
 * DIGGY side-panel dashboard — sidebar + the 7 tabs + composer + command palette + status bubble.
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
 *   preview?: boolean;                     // sample data is labelled when true (default)
 *   screenStates?: Partial<Record<NavTabId, ScreenState>>;
 * }
 * function Dashboard(props: DashboardProps): JSX.Element;
 * // END INTERFACE FOR INTEGRATION
 */
import { useCallback, useMemo, useState } from "react";
import { NAV_TABS, type AvatarAPI, type NavTabId } from "@diggy/shared";

import { Icon, type IconName } from "../Icon.js";
import { Composer } from "../primitives/Composer.js";
import { StatusBubble } from "../primitives/StatusBubble.js";
import { useHotkey } from "../hooks/useHotkey.js";
import { usePopOut } from "../hooks/usePopOut.js";
import { useStatusQueue } from "../hooks/useStatusQueue.js";
import { CommandPalette, type PaletteCommand } from "./CommandPalette.js";
import { Sidebar } from "./Sidebar.js";
import { sampleQuickCommands, sampleUser } from "./sampleData.js";
import type { ScreenState } from "./ScreenState.js";
import { ActionsScreen } from "./screens/ActionsScreen.js";
import { ActivityScreen } from "./screens/ActivityScreen.js";
import { AssistantScreen } from "./screens/AssistantScreen.js";
import { HomeScreen } from "./screens/HomeScreen.js";
import { IntegrationsScreen } from "./screens/IntegrationsScreen.js";
import { MonitorScreen } from "./screens/MonitorScreen.js";
import { VaultScreen } from "./screens/VaultScreen.js";

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
  /** When true (default) sample rows are labelled as a preview. */
  preview?: boolean;
  /** Optional per-screen state so empty / loading / error are real, not implied. */
  screenStates?: Partial<Record<NavTabId, ScreenState>>;
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

/** Map a button's label onto a runtime intent (`null` = local-only feedback). */
export function intentForLabel(label: string): ActionIntent | null {
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
  preview = true,
  screenStates,
}: DashboardProps) {
  const [internalTab, setInternalTab] = useState<NavTabId>("home");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const activeTab = tab ?? internalTab;
  const status = useStatusQueue();
  const popOut = usePopOut({ elementId: "dg-popout-root", width: 420, height: 760 });

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
      // Real work goes to the runtime; everything else is a local acknowledgement.
      const action = intentForLabel(intent ?? label);
      if (action && onAction) {
        onAction(action);
        return;
      }
      status.push({ text: intent ? `${label} · ${intent}` : label, priority: 1, mood: "thinking" });
    },
    [status, onAction],
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
              />
            ) : null}
            {activeTab === "actions" ? (
              <ActionsScreen
                onCommand={handleCommand}
                state={stateFor("actions")}
                preview={preview}
              />
            ) : null}
            {activeTab === "integrations" ? (
              <IntegrationsScreen
                onCommand={handleCommand}
                state={stateFor("integrations")}
                preview={preview}
              />
            ) : null}
            {activeTab === "vault" ? (
              <VaultScreen
                onCommand={handleCommand}
                state={stateFor("vault")}
                preview={preview}
              />
            ) : null}
            {activeTab === "activity" ? (
              <ActivityScreen
                onCommand={handleCommand}
                state={stateFor("activity")}
                preview={preview}
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

      <div className="dg-statusdock">
        <StatusBubble
          text={status.current?.text ?? "Monitoring 12 websites — all calm."}
          priority={status.current?.priority ?? 0}
          variant={status.current?.style ?? "thought"}
          collapsed={status.collapsed}
          onToggleCollapse={status.toggleCollapse}
          api={statusApi}
        />
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={commands}
      />
    </div>
  );
}
