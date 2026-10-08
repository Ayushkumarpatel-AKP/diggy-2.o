/**
 * @diggy/ui — DIGGY's premium pastel + gold design system and the 7-tab side-panel dashboard.
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
 * AvatarChip, IconButton, QuickAction, StatusBubble
 * //  hooks
 * insertByPriority, truncateStatus, type StatusItem, type StatusPriority, type BubbleStyle
 * useHotkey, usePopOut, useStatusQueue
 * //  app
 * Dashboard (the 7-tab surface), Sidebar, ScreenHeader, CommandPalette
 * HomeScreen, AssistantScreen, MonitorScreen, ActionsScreen, IntegrationsScreen,
 * VaultScreen, ActivityScreen
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
export * from "./primitives/StatusBubble.js";
export * from "./primitives/Composer.js";

export * from "./hooks/statusQueue.js";
export * from "./hooks/useHotkey.js";
export * from "./hooks/usePopOut.js";
export * from "./hooks/useStatusQueue.js";

export * from "./app/format.js";
export * from "./app/sampleData.js";
export * from "./app/ScreenHeader.js";
export * from "./app/ScreenState.js";
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
