import { BusEvents, createBus } from "@diggy/shared";
import { VOICE_STATUS } from "@diggy/voice";

import {
  normalizeSettings,
  readFallback,
  registryFromSettings,
  SETTINGS_KEY,
  settingsReady,
  type ProviderSettings,
} from "../src/provider-settings.js";
import { createAgentRuntime, type AgentRuntime } from "../src/agent-runtime.js";
import type { SendToPage } from "../src/page-tools.js";
import { bindPushToTalk, type CommandsApi, type RuntimeMessageApi } from "../src/shortcut.js";

/**
 * Extension background service worker.
 *
 * Every command the user gives — typed, spoken, or a button — goes through one
 * path: the agent loop (`createAgentRuntime` → `runBrain`). The model plans, calls
 * the page tools through this worker's bridge to the content script, and reports
 * each step so the thinking bubble shows what is happening.
 *
 * Two rules live here rather than in the prompt, because a prompt is not a
 * security boundary:
 *
 * 1. **The model cannot submit.** It has no such tool. When a run fills a form,
 *    this worker raises a confirmation and the *user* presses Submit — only then
 *    does the user-gesture path call the page's submit control.
 * 2. **Page text reaches the model fenced.** It is read through the Action
 *    Engine, which taints the session and wraps it as untrusted DATA. We never
 *    inline raw page text into a prompt here.
 *
 * Ctrl+Space drives dictation: press to listen, press again to send the
 * transcript to the same command path.
 */
const bus = createBus({ source: "background" });

/* --- settings ------------------------------------------------------------- */

async function readSettings(): Promise<ProviderSettings> {
  try {
    const stored = await browser.storage.local.get(SETTINGS_KEY);
    return normalizeSettings(stored[SETTINGS_KEY]);
  } catch {
    return normalizeSettings(undefined);
  }
}

/** `sidePanel` is a valid MV3 API but missing from WXT 0.19 browser typings. */
interface SidePanelApi {
  setPanelBehavior(options: { openPanelOnClick?: boolean }): Promise<void>;
}

function getSidePanel(): SidePanelApi | undefined {
  return (browser as unknown as { sidePanel?: SidePanelApi }).sidePanel;
}

/* --- talking to the page -------------------------------------------------- */

async function activeTabId(): Promise<number | undefined> {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    return tab?.id ?? undefined;
  } catch {
    return undefined;
  }
}

async function sendToTab(message: unknown): Promise<void> {
  const tabId = await activeTabId();
  if (tabId == null) return;
  try {
    await browser.tabs.sendMessage(tabId, message);
  } catch {
    // No active tab, or no content script in it.
  }
}

/** The bridge the agent runtime uses to reach the Action Engine in the page. */
const sendToPage: SendToPage = async (message: unknown) => {
  const tabId = await activeTabId();
  if (tabId == null) throw new Error("No page is open.");
  return browser.tabs.sendMessage(tabId, message);
};

function toTab(payload: { action: "say" | "status" | "play"; text?: string }): Promise<void> {
  return sendToTab({ type: "diggy:avatar", ...payload });
}

/** Push a message to the side panel (background `sendMessage` excludes itself). */
function broadcast(message: unknown): void {
  void browser.runtime.sendMessage(message).catch(() => undefined);
}

async function setStatus(text: string): Promise<void> {
  bus.emit(BusEvents.AvatarStatus, { text });
  await toTab({ action: "status", text });
}

/* --- progress + confirmation ---------------------------------------------- */

/** The id the panel keys the current run's line on, so steps replace each other. */
let runId = 0;
/** The submit offer currently on screen, if any. */
let pendingSubmit: string | null = null;

function progress(id: number, text: string): void {
  void toTab({ action: "status", text });
  broadcast({ type: "diggy:progress", id: `run_${id}`, text, priority: 1, style: "thought" });
}

function offerSubmit(id: number): void {
  pendingSubmit = `submit_${id}`;
  const confirmation = {
    id: pendingSubmit,
    title: "The form is filled in",
    detail: "Nothing has been sent. Press Submit and I'll press it for you.",
    confirmLabel: "Submit now",
    denyLabel: "Not yet",
  };
  broadcast({ type: "diggy:confirmation", confirmation });
  void toTab({ action: "status", text: "Form ready — press Submit when you want it sent." });
}

function clearSubmit(): void {
  pendingSubmit = null;
  broadcast({ type: "diggy:confirmation", confirmation: null });
}

/* --- dictation (Ctrl+Space toggle, live transcript) ---------------------- */

const dictation = { active: false, interim: "", final: "" };

async function startDictation(): Promise<void> {
  if (dictation.active) return;
  dictation.active = true;
  dictation.interim = "";
  dictation.final = "";
  await setStatus(VOICE_STATUS.listening);
  const settings = await readSettings();
  await sendToTab({ type: "diggy:dictate", action: "start", lang: settings.lang });
}

async function stopDictation(): Promise<void> {
  if (!dictation.active) return;
  dictation.active = false;
  await setStatus(VOICE_STATUS.thinking);
  await sendToTab({ type: "diggy:dictate", action: "stop" });
  // The page reports `dictate-end` once recognition has flushed its final text.
}

async function finishDictation(): Promise<void> {
  const text = (dictation.final || dictation.interim).trim();
  dictation.interim = "";
  dictation.final = "";
  if (!text) {
    await setStatus("");
    await toTab({ action: "status", text: "I didn't catch that — Ctrl+Space and try again." });
    return;
  }
  await runGoal(text);
}

/** Ctrl+Space drives this: press → listen, press again → act. */
const dictateHost = {
  get state(): string {
    return dictation.active ? "listening" : "idle";
  },
  press: () => startDictation(),
  release: () => stopDictation(),
  toggle: () => (dictation.active ? stopDictation() : startDictation()),
};

/* --- the command path ----------------------------------------------------- */

async function buildRuntime(context?: string): Promise<AgentRuntime | null> {
  const settings = await readSettings();
  if (!settingsReady(settings)) {
    await toTab({
      action: "status",
      text: "Add your API key in DIGGY settings — I need a model to think with.",
    });
    return null;
  }
  const fallback = await readFallback();
  return createAgentRuntime({
    model: registryFromSettings(settings, fallback),
    send: sendToPage,
    onProgress: (line) => progress(runId, line),
    onNotify: async (title, message) => {
      await toTab({ action: "say", text: message ? `${title}. ${message}` : title });
    },
    ...(context ? { context } : {}),
  });
}

/** The page the user is looking at, as context (not as content). */
async function pageContext(): Promise<string | undefined> {
  const tabId = await activeTabId();
  if (tabId == null) return undefined;
  try {
    const page = (await browser.tabs.sendMessage(tabId, { type: "diggy:read" })) as
      | { url: string; title: string }
      | undefined;
    if (!page?.url) return undefined;
    return [
      "# The page the user is on",
      `- Title: ${page.title || "(untitled)"}`,
      `- URL: ${page.url}`,
      "Read it with the page tools rather than assuming what it says.",
    ].join("\n");
  } catch {
    return undefined;
  }
}

/** Run one goal through the agent loop and report the outcome. */
async function runGoal(goal: string, context?: string): Promise<void> {
  const runtime = await buildRuntime(context);
  if (!runtime) return;

  const id = (runId += 1);
  clearSubmit();
  await setStatus(VOICE_STATUS.thinking);

  let spoken: string;
  try {
    const result = await runtime.run(goal);
    spoken =
      result.text ||
      (result.status === "budget-exceeded"
        ? result.continueMessage ?? "I ran out of steps. Tell me to continue."
        : "I finished, but I'm not sure what to say about it.");

    if (result.status === "error") {
      spoken = `I hit a problem: ${result.error ?? "the model did not answer"}`;
    }
    if (result.filledForm) offerSubmit(id);
  } catch (error) {
    spoken = `Sorry — something went wrong. ${error instanceof Error ? error.message : ""}`.trim();
  }

  await setStatus(VOICE_STATUS.speaking);
  await toTab({ action: "say", text: spoken });
  await setStatus("");
}

/**
 * Press the page's submit control for the user.
 *
 * Reachable only from the panel's user-gesture message, and only for the
 * confirmation currently on screen — a stale or forged id does nothing.
 */
async function confirmSubmit(id: string | undefined): Promise<void> {
  if (!pendingSubmit || id !== pendingSubmit) {
    await toTab({ action: "status", text: "That confirmation has expired." });
    return;
  }
  clearSubmit();
  const runtime = await buildRuntime();
  if (!runtime) return;

  const outcome = await runtime.submit();
  const spoken = outcome.ok
    ? `Sent it — I pressed “${outcome.label ?? "Submit"}”.`
    : `I couldn't submit it: ${outcome.error ?? "no submit button found"}`;
  await toTab({ action: "say", text: spoken });
}

/** Fixed questions behind the dashboard's quick buttons. */
const ASSIST_GOALS: Record<string, string> = {
  summarize: "Read this page and summarise it in three to five short sentences.",
  explain: "Read this page and explain what it is about, in plain language.",
  extract: "Read this page and pull out the most important facts, dates and numbers.",
  repository: "Read this repository page: what it is, its stack, and how active it looks.",
  opportunities: "Read this page and list any deadlines, eligibility rules or opportunities.",
  track: "Watch this page so I am told as soon as something on it changes.",
};

/** A button or the composer in the side panel asked for something. */
async function handleCommand(intent: string | undefined, text?: string): Promise<void> {
  if (!intent) return;

  if (intent === "voice") {
    await dictateHost.toggle();
    return;
  }
  if (intent === "confirm") {
    await confirmSubmit(text);
    return;
  }
  if (intent === "deny") {
    clearSubmit();
    return;
  }

  const goal =
    intent === "ask"
      ? (text ?? "").trim()
      : ASSIST_GOALS[intent] ?? ((text ?? "").trim() || intent);

  if (!goal) return;
  await runGoal(goal, await pageContext());
}

export default defineBackground(() => {
  bus.emit(BusEvents.AvatarStatus, { text: "DIGGY is ready" });

  browser.runtime.onInstalled.addListener(() => {
    const sidePanel = getSidePanel();
    if (!sidePanel) return;
    void sidePanel
      .setPanelBehavior({ openPanelOnClick: true })
      .catch((error: unknown) => console.error("[diggy] side panel behavior failed", error));
  });

  // Ctrl+Space toggles dictation; pages that see real key events get hold-to-talk.
  bindPushToTalk(dictateHost, {
    commands: browser.commands as unknown as CommandsApi,
    runtime: browser.runtime as unknown as RuntimeMessageApi,
  });

  browser.runtime.onMessage.addListener((raw: unknown) => {
    const message = raw as
      | { type?: string; intent?: string; text?: string; confirmationId?: string }
      | undefined;
    if (!message) return undefined;

    // The side panel's command channel. (The Action Engine's own messages use
    // `diggy:action` and are handled in the content script, not here.)
    if (message.type === "diggy:command") {
      void handleCommand(message.intent, message.text ?? message.confirmationId);
      return undefined;
    }
    // Live dictation: show what the user is saying, keep the settled text.
    if (message.type === "diggy:dictate-interim" && typeof message.text === "string") {
      dictation.interim = message.text;
      void toTab({ action: "status", text: `🎤 ${message.text}` });
      return undefined;
    }
    if (message.type === "diggy:dictate-final" && typeof message.text === "string") {
      dictation.final = message.text;
      return undefined;
    }
    if (message.type === "diggy:dictate-end") {
      void finishDictation();
      return undefined;
    }
    return undefined;
  });
});
