/**
 * DIGGY side-panel dashboard — sidebar + the 7 tabs + command palette + status bubble.
 * This is the single surface the extension side panel, the pop-out window and the demo all
 * render, so what you review in `apps/demo` is exactly what ships.
 *
 * // INTERFACE FOR INTEGRATION
 * interface DashboardProps {
 *   tab?: NavTabId;                       // controlled tab
 *   onTabChange?(id: NavTabId): void;
 *   user?: { initials: string; name?: string; role?: string };
 *   statusApi?: Pick<AvatarAPI, "status">; // consumes AvatarAPI.status
 *   onSettings?(): void;
 * }
 * function Dashboard(props: DashboardProps): JSX.Element;
 * // END INTERFACE FOR INTEGRATION
 */
import { useCallback, useMemo, useState } from "react";
import { NAV_TABS, type AvatarAPI, type NavTabId } from "@diggy/shared";

import { Icon, type IconName } from "../Icon.js";
import { StatusBubble } from "../primitives/StatusBubble.js";
import { useHotkey } from "../hooks/useHotkey.js";
import { usePopOut } from "../hooks/usePopOut.js";
import { useStatusQueue } from "../hooks/useStatusQueue.js";
import { CommandPalette, type PaletteCommand } from "./CommandPalette.js";
import { ScreenHeader } from "./ScreenHeader.js";
import { Sidebar } from "./Sidebar.js";
import { sampleQuickCommands, sampleUser } from "./sampleData.js";
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
}

export function Dashboard({ tab, onTabChange, user, statusApi, onSettings }: DashboardProps) {
  const [internalTab, setInternalTab] = useState<NavTabId>("home");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const activeTab = tab ?? internalTab;
  const status = useStatusQueue();
  const popOut = usePopOut({ elementId: "dg-popout-root", width: 420, height: 760 });

  const selectTab = useCallback(
    (id: NavTabId) => {
      if (tab === undefined) setInternalTab(id);
      onTabChange?.(id);
    },
    [tab, onTabChange],
  );

  const handleCommand = useCallback(
    (label: string, intent?: string) => {
      status.push({ text: intent ? `${label} · ${intent}` : label, priority: 1, mood: "thinking" });
    },
    [status],
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
          <div className="dg-content">
            {activeTab === "home" ? (
              <HomeScreen
                onNavigate={selectTab}
                onOpenPalette={() => setPaletteOpen(true)}
                onCommand={handleCommand}
              />
            ) : null}
            {activeTab === "assistant" ? <AssistantScreen onCommand={handleCommand} /> : null}
            {activeTab === "monitor" ? <MonitorScreen onCommand={handleCommand} /> : null}
            {activeTab === "actions" ? <ActionsScreen onCommand={handleCommand} /> : null}
            {activeTab === "integrations" ? (
              <IntegrationsScreen onCommand={handleCommand} />
            ) : null}
            {activeTab === "vault" ? <VaultScreen onCommand={handleCommand} /> : null}
            {activeTab === "activity" ? <ActivityScreen onCommand={handleCommand} /> : null}
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
