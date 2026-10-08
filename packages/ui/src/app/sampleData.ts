/**
 * Sample data for the design gallery — every shape is drawn from `@diggy/shared` contracts
 * so screens can be swapped to live engines without touching the UI.
 *
 * Shapes that have no contract yet are marked `TEMP STUB — blocked on <owner>`.
 */
import type {
  ActivityEvent,
  MonitorKind,
  ProfileSchema,
  WatchSpec,
} from "@diggy/shared";

import type { IconName } from "../Icon.js";
import type { Tone } from "../theme.js";
import type { Severity } from "../primitives/AlertRow.js";
import { minutesAgo } from "./format.js";

/** Home hero + greeting. */
export const sampleUser = {
  initials: "AKP",
  name: "Ayush Kumar Patel",
  role: "Personal workspace",
  greeting: "Good Evening, AKP",
  subtitle: "Track what matters, automate the boring, and stay ahead.",
} as const;

export interface MetricData {
  id: string;
  icon: IconName;
  tone: Tone;
  value: number;
  label: string;
  sub?: { text: string; tone?: Tone };
}

export const sampleMetrics: MetricData[] = [
  { id: "watch", icon: "globe", tone: "blue", value: 12, label: "Websites Monitoring" },
  { id: "alerts", icon: "bell", tone: "pink", value: 3, label: "New Alerts", sub: { text: "2 urgent", tone: "danger" } },
  { id: "actions", icon: "check", tone: "mint", value: 5, label: "Actions Completed" },
  { id: "integrations", icon: "integrations", tone: "violet", value: 4, label: "Integrations Active" },
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

export const sampleAlerts: AlertData[] = [
  {
    id: "alert_sih",
    icon: "globe",
    tone: "primary",
    title: "SIH 2026 Results",
    source: "sih.gov.in",
    subtitle: "Results page updated",
    at: minutesAgo(10),
    severity: "high",
  },
  {
    id: "alert_nasa",
    icon: "globe",
    tone: "blue",
    title: "NASA Space Apps",
    source: "spaceappschallenge.org",
    subtitle: "Registrations are now open",
    at: minutesAgo(120),
    severity: "medium",
  },
  {
    id: "alert_gh",
    icon: "star",
    tone: "violet",
    title: "GitHub · AKP",
    source: "github.com",
    subtitle: "Your repository got 5 new stars",
    at: minutesAgo(240),
    severity: "info",
  },
];

/** Home → Recent Alerts may show a GitHub repo row; keep the label shape explicit. */

export interface QuickCommand {
  id: string;
  icon: IconName;
  tone: Tone;
  label: string;
  /** Sentinel passed to the page-agent / brain when wired. */
  intent: string;
}

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

export const sampleWatches: WatchRow[] = [
  {
    spec: {
      id: "watch_sih",
      url: "https://sih.gov.in",
      kind: "content_change",
      intervalSec: 900,
      createdAt: minutesAgo(60 * 24 * 6),
    },
    name: "SIH Results Portal",
    tags: ["Keywords", "Content Change", "New Posts"],
    active: true,
  },
  {
    spec: {
      id: "watch_nasa",
      url: "https://www.spaceappschallenge.org",
      kind: "registration_open",
      intervalSec: 1800,
      createdAt: minutesAgo(60 * 24 * 4),
    },
    name: "NASA Space Apps",
    tags: ["Registration", "Deadlines", "New Posts"],
    active: true,
  },
  {
    spec: {
      id: "watch_internshala",
      url: "https://internshala.com",
      kind: "new_post",
      intervalSec: 3600,
      createdAt: minutesAgo(60 * 24 * 2),
    },
    name: "Internshala",
    tags: ["New Internships", "Deadlines"],
    active: true,
  },
];

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

/** Actions screen rows. TEMP STUB — blocked on actions (`packages/page-agent`) history type. */
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

export const sampleActionLog: ActionLogRow[] = [
  { id: "act_1", icon: "edit", tone: "blue", title: "Filled Internship Form", subtitle: "Internshala · 14 fields", status: "completed", at: minutesAgo(78) },
  { id: "act_2", icon: "file", tone: "violet", title: "Summarized PDF", subtitle: "Research Paper (12 pages)", status: "completed", at: minutesAgo(120) },
  { id: "act_3", icon: "bell", tone: "primary", title: "Created Reminder", subtitle: "NASA deadline", status: "completed", at: minutesAgo(160) },
  { id: "act_4", icon: "globe", tone: "mint", title: "Opened Website", subtitle: "Google Solution Challenge", status: "completed", at: minutesAgo(185) },
  { id: "act_5", icon: "layers", tone: "pink", title: "Extracted Information", subtitle: "From SIH portal", status: "completed", at: minutesAgo(210) },
];

/** Integrations screen. TEMP STUB — blocked on integrations (`services/api`) catalog. */
export interface IntegrationRow {
  id: string;
  name: string;
  category: "Productivity" | "Development" | "Social";
  color: string;
  mark: string;
  status: "connected" | "connect";
}

export const sampleIntegrations: IntegrationRow[] = [
  { id: "gmail", name: "Gmail", category: "Productivity", color: "#EA4335", mark: "M", status: "connect" },
  { id: "calendar", name: "Calendar", category: "Productivity", color: "#4285F4", mark: "31", status: "connect" },
  { id: "github", name: "GitHub", category: "Development", color: "#24292F", mark: "GH", status: "connected" },
  { id: "notion", name: "Notion", category: "Productivity", color: "#111111", mark: "N", status: "connect" },
  { id: "linkedin", name: "LinkedIn", category: "Social", color: "#0A66C2", mark: "in", status: "connect" },
  { id: "youtube", name: "YouTube", category: "Social", color: "#FF0033", mark: "▶", status: "connect" },
  { id: "leetcode", name: "LeetCode", category: "Development", color: "#F89F1B", mark: "LC", status: "connect" },
];

/** Vault screen — locked fields carry tokens only, never plaintext. */
export const sampleProfile: ProfileSchema = {
  fullName: { key: "fullName", label: "Full Name", value: "Ayush Kumar Patel", visibility: "shared" },
  email: { key: "email", label: "Email", value: "ayush@gmail.com", visibility: "shared" },
  phone: { key: "phone", label: "Phone", value: "+91 98765 43210", visibility: "shared" },
  location: { key: "location", label: "Location", value: "Raipur, Chhattisgarh", visibility: "shared" },
  college: { key: "college", label: "College", value: "SSIPMT, CSE (AI)", visibility: "shared" },
  degree: { key: "degree", label: "Degree", value: "B.Tech", visibility: "shared" },
  semester: { key: "semester", label: "Semester", value: "7th", visibility: "shared" },
  skills: {
    key: "skills",
    label: "Skills",
    value: ["TypeScript", "React", "Python", "Node.js", "Playwright"],
    visibility: "shared",
  },
  links: {
    key: "links",
    label: "Links",
    value: {
      LinkedIn: "linkedin.com/in/ayush",
      GitHub: "github.com/AyushKumarPatel-AKP",
    },
    visibility: "shared",
  },
  resumeRef: { key: "resumeRef", label: "Resume", value: "resume-2026.pdf", visibility: "shared" },
  custom: [
    { key: "aadhaar", label: "Aadhaar", value: "{{LOCKED:aadhaar}}", visibility: "locked" },
    { key: "github", label: "GitHub", value: "github.com/AyushKumarPatel-AKP", visibility: "shared" },
  ],
};

/** Activity screen — canonical `ActivityEvent`s. */
export const sampleActivity: ActivityEvent[] = [
  { id: "ev_1", kind: "summary", title: "Page summarized", detail: "SIH Results", at: minutesAgo(24) },
  { id: "ev_2", kind: "monitored", title: "Found 3 new hackathons", detail: "Based on your profile", at: minutesAgo(71) },
  { id: "ev_3", kind: "filled_form", title: "Filled 8 fields on Internship form", detail: "Never auto-submitted — awaiting your review", at: minutesAgo(104) },
  { id: "ev_4", kind: "integration", title: "Gmail: 1 important mail", detail: "From: noreply@diggy.app", at: minutesAgo(136) },
  { id: "ev_5", kind: "integration", title: "GitHub: 3 new notifications", detail: "AyushKumarPatel-AKP", at: minutesAgo(161) },
  { id: "ev_6", kind: "action", title: "Created a reminder", detail: "NASA deadline", at: minutesAgo(181) },
];

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
