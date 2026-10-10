/**
 * @diggy/ui — DIGGY's premium pastel + gold design system and the 8-tab side-panel dashboard.
 *
 * Design source of truth: `diggy motion/Diggy Pastel Productivity Dashboard.png`.
 * Palette tokens: `@diggy/shared` -> `tokens` (re-exported here as `tokens`).
 *
 * Styling: import the stylesheet once per app:
 *   import "@diggy/ui/styles.css";
 *
 * // INTERFACE FOR INTEGRATION (public surface)
 * //  foundation
 * Icon, ICON_PATHS, type IconName, type IconProps
 * DiggyLogo, BrowserDots
 * tokens, TONES, type Tone, tokenCssVariables(), applyTokens()
 * //  primitives
 * Panel, Card, Button, Pill, Tabs, Input, SearchField, MetricTile, ListRow, AlertRow,
 * AvatarChip, IconButton, QuickAction, StatusBubble, type ActionPreview
 * ActionCard (w8-parts), Menu (w8-parts), NotificationPanel (w8-parts)
 * //  hooks
 * insertByPriority, truncateStatus, LONG_STATUS_MAX,
 * type StatusItem, type StatusPriority, type BubbleStyle
 * useHotkey, usePopOut, useStatusQueue, type StatusUpdate
 * useNotifications, type AppNotification (w8-parts)
 * type LiveStatus, type PendingConfirmation
 * //  app
 * Dashboard (the 8-tab surface), Sidebar, ScreenHeader, CommandPalette
 * HomeScreen, AssistantScreen, MonitorScreen, ActionsScreen, IntegrationsScreen,
 * VaultScreen, ActivityScreen, ApiKeysScreen, type ApiKeysSetup
 * //  sample data (review gallery)
 * sampleUser, sampleMetrics, sampleAlerts, sampleQuickCommands, sampleWatches,
 * sampleActionLog, sampleIntegrations, sampleProfile, sampleActivity
 * // END INTERFACE FOR INTEGRATION
 */

export * from "./theme.js";
export * from "./Icon.js";
export * from "./DiggyLogo.js";

export * from "./primitives/Button.js";
export * from "./primitives/Card.js";
export * from "./primitives/Pill.js";
export * from "./primitives/Tabs.js";
export * from "./primitives/Input.js";
export * from "./primitives/MetricTile.js";
export * from "./primitives/ListRow.js";
export * from "./primitives/AlertRow.js";
export * from "./primitives/AvatarChip.js";
export * from "./primitives/IconButton.js";
export * from "./primitives/QuickAction.js";
// Explicit rather than `export *`: `ActionCard` owns `ActionPreview`, and two
// star-exports both providing it is an ambiguous re-export.
export { StatusBubble } from "./primitives/StatusBubble.js";
export type { StatusBubbleProps } from "./primitives/StatusBubble.js";
export * from "./primitives/Composer.js";
export * from "./primitives/ActionCard.js";
export * from "./primitives/Menu.js";
export * from "./primitives/NotificationPanel.js";

export * from "./hooks/statusQueue.js";
export * from "./hooks/useHotkey.js";
export * from "./hooks/usePopOut.js";
export * from "./hooks/useStatusQueue.js";
export * from "./hooks/useNotifications.js";

export * from "./app/format.js";
export * from "./app/sampleData.js";
export * from "./app/ScreenHeader.js";
export * from "./app/ScreenState.js";
export * from "./app/SetupPanel.js";
export * from "./app/Sidebar.js";
export * from "./app/CommandPalette.js";
export * from "./app/Dashboard.js";
export * from "./app/screens/HomeScreen.js";
export * from "./app/screens/AssistantScreen.js";
export * from "./app/screens/MonitorScreen.js";
export * from "./app/screens/ActionsScreen.js";
export * from "./app/screens/IntegrationsScreen.js";
export * from "./app/screens/VaultScreen.js";
export * from "./app/screens/ActivityScreen.js";
export * from "./app/screens/ApiKeysScreen.js";
export * from "./app/screens/screenHelpers.js";
