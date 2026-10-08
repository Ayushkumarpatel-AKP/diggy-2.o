/**
 * Navigation map — the 7 tabs, in the order shown in the theme PNG.
 * Owning worker: ui (`packages/ui`, sidepanel).
 */

export const NAV_TABS = [
  { id: "home", label: "Home", icon: "home" },
  { id: "assistant", label: "Assistant", icon: "assistant" },
  { id: "monitor", label: "Monitor", icon: "monitor" },
  { id: "actions", label: "Actions", icon: "actions" },
  { id: "integrations", label: "Integrations", icon: "integrations" },
  { id: "vault", label: "Vault", icon: "vault" },
  { id: "activity", label: "Activity", icon: "activity" },
] as const;

export type NavTab = (typeof NAV_TABS)[number];
export type NavTabId = NavTab["id"];
