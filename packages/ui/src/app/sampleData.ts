/**
 * Screen data + the label/icon mappings the screens need.
 *
 * **There is deliberately no demo content here.** Every list starts empty and is
 * meant to be replaced by the live engines (monitor watches, activity log,
 * vault profile, integrations catalog). Screens render their own empty state
 * until real data arrives — see `app/ScreenState.tsx`.
 *
 * The `sample*` export names are kept only to avoid churning every screen; they
 * are empty collections, not samples.
 */
import type { ActivityEvent, MonitorKind, ProfileSchema, WatchSpec } from "@diggy/shared";

import type { IconName } from "../Icon.js";
import type { Tone } from "../theme.js";
import type { Severity } from "../primitives/AlertRow.js";

/** Time-of-day greeting — computed, never hardcoded to a person. */
function greetingForHour(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** Home hero. No user identity is assumed until the profile is loaded. */
export const sampleUser = {
  initials: "",
  name: "",
  role: "",
  greeting: greetingForHour(),
  subtitle: "Track what matters, automate the boring, and stay ahead.",
};

export interface MetricData {
  id: string;
  icon: IconName;
  tone: Tone;
  value: number;
  label: string;
  sub?: { text: string; tone?: Tone };
}

/** Home metric tiles — counts come from the live engines, so start at zero. */
export const sampleMetrics: MetricData[] = [
  { id: "watch", icon: "globe", tone: "blue", value: 0, label: "Websites Monitoring" },
  { id: "alerts", icon: "bell", tone: "pink", value: 0, label: "New Alerts" },
  { id: "actions", icon: "check", tone: "mint", value: 0, label: "Actions Completed" },
  { id: "integrations", icon: "integrations", tone: "violet", value: 0, label: "Integrations Active" },
];

/** Home → Recent Alerts. */
export interface AlertData {
  id: string;
  icon: IconName;
  tone: Tone;
  title: string;
  source: string;
  subtitle: string;
  at: number;
  severity: Severity;
}

export const sampleAlerts: AlertData[] = [];

export interface QuickCommand {
  id: string;
  icon: IconName;
  tone: Tone;
  label: string;
  /** Sentinel passed to the runtime when the button is pressed. */
  intent: string;
}

/**
 * Quick Commands — these are real product actions (each button performs work),
 * not demo content, so they stay.
 */
export const sampleQuickCommands: QuickCommand[] = [
  { id: "track", icon: "globe", tone: "blue", label: "Track this site", intent: "monitor.track" },
  { id: "summarize", icon: "file", tone: "violet", label: "Summarize page", intent: "read.summarize" },
  { id: "fill", icon: "edit", tone: "primary", label: "Fill form", intent: "form.fill" },
  { id: "explain", icon: "sparkle", tone: "pink", label: "Explain page", intent: "read.explain" },
  { id: "repo", icon: "box", tone: "mint", label: "Analyze repository", intent: "read.repo" },
];

/** Monitor screen rows: a `WatchSpec` plus display-only metadata. */
export interface WatchRow {
  spec: WatchSpec;
  name: string;
  tags: string[];
  active: boolean;
}

export const sampleWatches: WatchRow[] = [];

export const MONITOR_KIND_LABEL: Record<MonitorKind, string> = {
  content_change: "Content Change",
  keyword: "Keyword",
  new_post: "New Post",
  registration_open: "Registration",
  deadline_change: "Deadline Change",
  release_published: "Release",
  price_change: "Price Change",
  custom: "Custom",
};

/** Actions screen rows. */
export type ActionStatus = "completed" | "scheduled" | "failed";

export interface ActionLogRow {
  id: string;
  icon: IconName;
  tone: Tone;
  title: string;
  subtitle: string;
  status: ActionStatus;
  at: number;
}

export const sampleActionLog: ActionLogRow[] = [];

/** Integrations screen — the connectable catalog comes from `services/api`. */
export interface IntegrationRow {
  id: string;
  name: string;
  category: "Productivity" | "Development" | "Social";
  color: string;
  mark: string;
  status: "connected" | "connect";
}

export const sampleIntegrations: IntegrationRow[] = [];

/** Vault screen — filled from the encrypted profile once it is unlocked. */
export const sampleProfile: ProfileSchema = {};

/** Activity screen — filled from the Activity Center log. */
export const sampleActivity: ActivityEvent[] = [];

export const ACTIVITY_ICON: Record<ActivityEvent["kind"], IconName> = {
  read_page: "eye",
  summary: "file",
  filled_form: "edit",
  opened_site: "globe",
  monitored: "monitor",
  action: "sparkle",
  alert: "bell",
  integration: "integrations",
  voice: "mic",
  error: "alert",
};

export const ACTIVITY_TONE: Record<ActivityEvent["kind"], Tone> = {
  read_page: "blue",
  summary: "violet",
  filled_form: "mint",
  opened_site: "blue",
  monitored: "primary",
  action: "violet",
  alert: "danger",
  integration: "pink",
  voice: "violet",
  error: "danger",
};
