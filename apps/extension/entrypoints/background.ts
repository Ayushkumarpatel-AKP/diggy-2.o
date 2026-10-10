import { BusEvents, createBus } from "@diggy/shared";
import type { FailoverRegistry } from "@diggy/core";
import { VOICE_STATUS } from "@diggy/voice";

import {
  normalizeSettings,
  readFallback,
  registryFromSettings,
  SETTINGS_KEY,
  settingsReady,
  type ProviderSettings,
} from "../src/provider-settings.js";
import { createAgentRuntime, type AgentRun, type AgentRuntime } from "../src/agent-runtime.js";
import type { SendToPage } from "../src/page-tools.js";
import { createUnifiedRuntime, type UnifiedRuntime } from "../src/unified-runtime.js";
import { createChatHistory } from "../src/chat-history.js";
import { cachedSearch, createTtlCache, createUsageLedger } from "../src/usage.js";
import { createVaultRuntime } from "../src/vault-runtime.js";
import { vaultTools } from "../src/vault-tools.js";
import { emptyVaultData } from "@diggy/vault";
import { createConnectors } from "../src/connectors/index.js";
import type { SearchOutcome } from "../src/search-web.js";
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

/**
 * The engines that keep running between commands — the monitor (tracking), the
 * reminder engine and the activity log.
 *
 * They are created inside `defineBackground` because they only make sense in a
 * live service worker, and the agent loop reads them through `toolDeps()` when it
 * builds its tool set. Without this, tracking and reminders exist as code and
 * never fire, which is exactly how they read as broken.
 */
let runtime: UnifiedRuntime | null = null;

/** Conversation history — what makes "and the next one" mean something. */
const chat = createChatHistory();
/** What the model calls are costing, and on which provider. */
const usage = createUsageLedger();
/** Identical searches inside five minutes are free. */
const searchCache = createTtlCache<SearchOutcome>(5 * 60 * 1000);
/** The encrypted profile DIGGY may answer from. */
const vault = createVaultRuntime();

/**
 * Confirmations waiting on a button press, keyed by id.
 *
 * Two things use this one channel: the submit offer after a form is filled, and
 * a vault lookup that needs the user's approval for one field. Keeping them on
 * one channel means the panel has one thing to render and one thing to answer.
 */
const pendingApprovals = new Map<string, (approved: boolean) => void>();

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

/** The URL of the focused tab, or undefined when there isn't one. */
async function activeTabUrl(): Promise<string | undefined> {
  try {
    const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
    return tab?.url;
  } catch {
    return undefined;
  }
}

/** The bridge the agent runtime uses to reach the Action Engine in the page. */
const sendToPage: SendToPage = async (message: unknown) => {
  const tabId = await activeTabId();
  if (tabId == null) throw new Error("No page is open.");
  return browser.tabs.sendMessage(tabId, message);
};

function toTab(payload: {
  action: "say" | "status" | "play" | "card";
  text?: string;
  state?: string;
  card?: { title?: string; detail?: string; targetUrl?: string; thumbnailUrl?: string } | null;
}): Promise<void> {
  return sendToTab({ type: "diggy:avatar", ...payload });
}

/** Push a message to the side panel (background `sendMessage` excludes itself). */
function broadcast(message: unknown): void {
  void browser.runtime.sendMessage(message).catch(() => undefined);
}

/* --- which tab owns the avatar -------------------------------------------- */

/**
 * The id of the tab currently rendering the avatar.
 *
 * Exactly one tab renders it at a time. The avatar is a WebGL scene plus a 17 MB
 * model, so letting every tab build its own made opening a new tab expensive and
 * left invisible scenes running in the background. This is the whole fix: the
 * background decides, and switching tabs moves the avatar rather than duplicating
 * it.
 */
let avatarTabId: number | undefined;

async function sendAvatar(tabId: number, action: "mount" | "unmount"): Promise<void> {
  try {
    await browser.tabs.sendMessage(tabId, { type: "diggy:avatar", action });
  } catch {
    // No content script in that tab (a browser page, a PDF, or it just closed).
  }
}

/** Give the avatar to `tabId`, releasing whichever tab had it. */
async function claimAvatar(tabId: number | undefined): Promise<void> {
  if (tabId === avatarTabId) return;
  const previous = avatarTabId;
  avatarTabId = tabId;
  if (previous !== undefined && previous !== tabId) await sendAvatar(previous, "unmount");
  if (tabId !== undefined) await sendAvatar(tabId, "mount");
}

/** Re-point the avatar at whatever tab is focused now. */
async function syncAvatarToActiveTab(): Promise<void> {
  try {
    const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
    await claimAvatar(tab?.id);
  } catch {
    // No focused window (the browser is minimised, say).
  }
}

/**
 * A content script announced itself. Mount only if it is the tab the user is
 * looking at, so a link opened in a background tab stays completely cold.
 */
async function onTabHello(tabId: number | undefined): Promise<void> {
  if (tabId === undefined) return;
  try {
    const [active] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
    if (active?.id === tabId) await claimAvatar(tabId);
    else await sendAvatar(tabId, "unmount");
  } catch {
    /* ignore */
  }
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

let approvalSeq = 0;

/**
 * Ask the user to approve one action, and wait for the answer.
 *
 * Used for a vault lookup, where the whole point is that the model cannot
 * release a locked field on its own. The promise only settles when the user
 * presses a button, so a forgotten prompt cannot silently approve anything.
 */
function requestApproval(
  title: string,
  detail: string,
  extra?: { targetUrl?: string; thumbnailUrl?: string },
): Promise<boolean> {
  const id = `approve_${(approvalSeq += 1)}`;
  return new Promise<boolean>((resolve) => {
    pendingApprovals.set(id, (approved) => {
      pendingApprovals.delete(id);
      broadcast({ type: "diggy:confirmation", confirmation: null });
      resolve(approved);
    });
    broadcast({
      type: "diggy:confirmation",
      confirmation: {
        id,
        title,
        detail,
        confirmLabel: "Allow",
        denyLabel: "Not now",
        // The preview card shows the thumbnail and host when it has them.
        ...(extra?.targetUrl ? { targetUrl: extra.targetUrl } : {}),
        ...(extra?.thumbnailUrl ? { thumbnailUrl: extra.thumbnailUrl } : {}),
      },
    });
    void toTab({ action: "status", text: title });
  });
}

/** What the user actually typed, for the navigation rule below. */
let currentGoal = "";

/**
 * The hard navigation rule.
 *
 * The agent has no raw `navigate` tool, so every navigation arrives here. If the
 * user named the target — "open youtube.com", "go to the docs" — it is their own
 * instruction and goes straight through. If the model thought of the site by
 * itself, the user is asked first. That is what stops a *question* from opening
 * YouTube, and it is a rule the model cannot talk its way around, unlike a prompt.
 */
async function allowNavigation(url: string, reason?: string): Promise<boolean> {
  let host = "";
  try {
    host = new URL(url).host.replace(/^www\./, "");
  } catch {
    return false;
  }

  const said = currentGoal.toLowerCase();
  const bare = host.split(".")[0] ?? host;

  // They named the site…
  const named = said.includes(host) || (bare.length > 3 && said.includes(bare));
  if (named) return true;

  /*
   * …or they plainly asked to go somewhere. "open yt" names YouTube by an
   * abbreviation and "play that video" names nothing, but both are navigation
   * instructions — asking again there is the over-confirming the user complained
   * about. A navigation verb is the signal, and a question has none.
   */
  const NAV_VERBS = /\b(open|go to|goto|visit|navigate|launch|browse|play|watch|show me)\b/;
  if (NAV_VERBS.test(said)) return true;

  // No verb and no name: the model chose this site by itself, so ask.
  return requestApproval(
    `Open ${host}?`,
    reason ?? "This changes what you are looking at — allow it?",
    { targetUrl: url },
  );
}
function answerApproval(id: string, approved: boolean): boolean {
  const resolve = pendingApprovals.get(id);
  if (!resolve) return false;
  resolve(approved);
  return true;
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

/** What a run needs: the agent, and the registry it bills against. */
interface PreparedRun {
  agent: AgentRuntime;
  registry: FailoverRegistry;
}

/** Build the agent for one run. Returns null (with a spoken reason) when it cannot. */
async function buildAgent(context?: string): Promise<PreparedRun | null> {
  const settings = await readSettings();
  if (!settingsReady(settings)) {
    await toTab({
      action: "status",
      text: "Add your API key in DIGGY settings — I need a model to think with.",
    });
    return null;
  }

  const deps = runtime?.toolDeps();
  if (!deps) {
    await toTab({ action: "status", text: "Still starting up — try that again in a moment." });
    return null;
  }

  const fallback = await readFallback();
  const registry = registryFromSettings(settings, fallback);
  const agent = createAgentRuntime({
    model: registry,
    send: sendToPage,
    onProgress: (line) => progress(runId, line),
    onNotify: async (title, message) => {
      await toTab({ action: "say", text: message ? `${title}. ${message}` : title });
    },
    watches: deps.watches,
    reminders: deps.reminders,
    // A repeat search inside the TTL is free, which is the cheapest token saving
    // available — a follow-up usually repeats the first question.
    search: cachedSearch(searchCache, deps.search),
    fetchPage: deps.fetchPage,
    extraTools: vaultTools({
      vault,
      requestApproval: ({ label }) =>
        requestApproval(
          `Let DIGGY use “${label}”?`,
          "Only for this request — nothing is saved or sent anywhere else.",
        ),
    }),
    // Anything that changes what the user is looking at is proposed, not done.
    approve: (request) =>
      requestApproval(request.title, request.detail, {
        ...(request.targetUrl ? { targetUrl: request.targetUrl } : {}),
        ...(request.thumbnailUrl ? { thumbnailUrl: request.thumbnailUrl } : {}),
      }),
    allowNavigation,
    ...(context ? { context } : {}),
  });

  return { agent, registry };
}

/**
 * Bill the run against the ledger.
 *
 * The registry counts tokens and cost per provider already, and this registry is
 * fresh for the run, so its metrics *are* this run's usage — which also means the
 * readout shows when the fallback provider was the one actually used.
 */
async function recordUsage(registry: FailoverRegistry, model: string): Promise<void> {
  try {
    for (const metric of registry.allMetrics()) {
      if (metric.successes === 0 && metric.promptTokens === 0 && metric.completionTokens === 0) continue;
      usage.record({
        provider: metric.providerId,
        model,
        promptTokens: metric.promptTokens,
        completionTokens: metric.completionTokens,
        costUsd: metric.costUsd,
      });
    }
  } catch {
    /* accounting must never break a command */
  }
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
  // The navigation rule needs to know what the user actually asked for.
  currentGoal = goal;
  const prepared = await buildAgent(context);
  if (!prepared) return;

  const settings = await readSettings();
  const id = (runId += 1);
  clearSubmit();
  await setStatus(VOICE_STATUS.thinking);

  let spoken: string;
  let runResult: AgentRun | undefined;
  try {
    const result = await prepared.agent.run(goal);
    runResult = result;
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

  await recordUsage(prepared.registry, settings.model);
  // Remember the exchange so the next command has context.
  await chat.append(goal, spoken);
  // Record what was actually done. Without this the Actions and Activity screens
  // had no producer at all — they could only ever be empty.
  try {
    runtime?.activity.record({
      kind: "action",
      title: goal,
      detail: spoken.slice(0, 200),
    });
  } catch {
    /* logging must never break a command */
  }

  await setStatus(VOICE_STATUS.speaking);
  await toTab({ action: "say", text: spoken });
  await setStatus("");

  /*
   * If the answer points somewhere specific, show it as a card rather than
   * burying the link in a one-line bubble that is clipped at a couple of hundred
   * characters. This is what makes a thumbnail and a clickable target appear at
   * all — previously the card only ever rendered for an *approval*, so a normal
   * answer had nowhere to put a link.
   */
  /*
   * Show a card when there is something to show. The link comes from what the
   * tools returned (the model rarely repeats it in its reply), falling back to a
   * URL in the text only if the tools gave us nothing.
   */
  let link = runResult?.card?.targetUrl;
  let thumbnailUrl = runResult?.card?.thumbnailUrl;
  if (!link) {
    const found = /https?:\/\/[^\s)"'<>]+/i.exec(spoken)?.[0];
    if (found) {
      link = found;
      const id = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/.exec(found)?.[1];
      if (id) thumbnailUrl = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    }
  }
  const card = link
    ? {
        title: goal,
        detail: spoken.slice(0, 300),
        targetUrl: link,
        ...(thumbnailUrl ? { thumbnailUrl } : {}),
      }
    : null;
  // The panel's card and the avatar's bubble are the same result, so they are
  // sent together and cannot disagree.
  broadcast({ type: "diggy:card", card });
  await toTab({ action: "card", card });

  // Watches/reminders/spend may have changed during the run.
  void broadcastState();
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
  const prepared = await buildAgent();
  if (!prepared) return;

  const outcome = await prepared.agent.submit();
  const spoken = outcome.ok
    ? `Sent it — I pressed “${outcome.label ?? "Submit"}”.`
    : `I couldn't submit it: ${outcome.error ?? "no submit button found"}`;
  await toTab({ action: "say", text: spoken });
}

/**
 * Push one consistent snapshot to the panel and the on-page avatar.
 *
 * This is the UI↔avatar sync channel: whatever the engines know — vault state,
 * watches, reminders, spend — is broadcast as one message, so the panel and the
 * page can never show a different story about the same moment.
 */
async function broadcastState(): Promise<void> {
  const deps = runtime?.toolDeps();
  let vaultStatus: { exists: boolean; unlocked: boolean } = { exists: false, unlocked: false };
  /*
   * The profile has to travel with the status. It did not before, so unlocking the
   * vault broadcast `{exists, unlocked}` and nothing else — the screen had no
   * fields to draw, which is why the Vault looked broken even when it opened.
   */
  let vaultProfile: unknown;
  try {
    vaultStatus = await vault.status();
    if (vaultStatus.unlocked) vaultProfile = await vault.profile();
  } catch {
    /* no vault yet is a normal state, not an error */
  }
  let usageLine = "";
  try {
    usageLine = await usage.summary();
  } catch {
    /* accounting is optional */
  }
  // The live activity log, so the Activity screen shows real events rather than
  // an empty placeholder.
  let events: unknown[] = [];
  try {
    events = await runtime?.activity.list({ limit: 60 }) ?? [];
  } catch {
    /* an empty log is a normal state */
  }

  // The connector catalogue. `status()` only reads storage on this path, so the
  // broadcast stays cheap — no network on every state change.
  let integrations: { id: string; name: string; category: string; status: string }[] = [];
  try {
    integrations = await Promise.all(
      createConnectors().map(async (connector) => ({
        id: connector.id,
        name: connector.label,
        category: connector.category,
        status: await connector.status(),
      })),
    );
  } catch {
    /* a connector failing to report must not blank the whole screen */
  }

  broadcast({
    type: "diggy:state",
    state: {
      vault: vaultStatus,
      ...(vaultProfile !== undefined ? { vaultProfile } : {}),
      watches: deps ? deps.watches.list().map((entry) => entry.spec) : [],
      reminders: deps ? deps.reminders.list() : [],
      usage: usageLine,
      events,
      integrations,
    },
  });
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

  // The panel's answer to whatever it is showing. An approval (a vault lookup)
  // settles a pending promise; anything else is the submit offer.
  if (intent === "confirm") {
    if (text && answerApproval(text, true)) return;
    await confirmSubmit(text);
    return;
  }
  if (intent === "deny") {
    if (text && answerApproval(text, false)) return;
    clearSubmit();
    return;
  }

  // Local, non-model commands.
  if (intent === "state") {
    await broadcastState();
    return;
  }
  if (intent === "usage") {
    await toTab({ action: "status", text: await usage.summary() });
    return;
  }
  if (intent === "chat.clear") {
    await chat.clear();
    await toTab({ action: "status", text: "Fresh conversation — I've forgotten the last one." });
    await broadcastState();
    return;
  }
  if (intent === "vault.status") {
    await broadcastState();
    return;
  }
  if (intent === "vault.unlock") {
    const unlocked = await vault.unlock(text ?? "");
    await toTab({
      action: "status",
      text: unlocked ? "Vault unlocked." : "That passphrase didn't work.",
    });
    await broadcastState();
    return;
  }
  if (intent === "vault.create") {
    try {
      await vault.create(text ?? "", emptyVaultData());
      await toTab({ action: "status", text: "Vault created and unlocked." });
    } catch (error) {
      await toTab({
        action: "status",
        text: `Couldn't create the vault: ${error instanceof Error ? error.message : "unknown error"}`,
      });
    }
    await broadcastState();
    return;
  }
  if (intent === "setup.open") {
    broadcast({ type: "diggy:setup", open: true });
    return;
  }
  if (intent.startsWith("integration.")) {
    // The label carries the id: `integration.connect:github`.
    const [verb, connectorId] = intent.split(":");
    const connector = createConnectors().find((entry) => entry.id === connectorId);
    if (!connector) {
      await toTab({ action: "status", text: "That integration isn't available in this build." });
      return;
    }
    if (verb === "integration.disconnect") {
      await connector.disconnect();
      await toTab({ action: "status", text: `${connector.label} disconnected.` });
    } else {
      const result = await connector.connect();
      await toTab({
        action: "status",
        text: result.ok
          ? `${connector.label} connected.`
          : `${connector.label}: ${result.error ?? "could not connect"}`,
      });
    }
    await broadcastState();
    return;
  }
  if (intent.startsWith("watch.")) {
    // The Monitor screen's controls. Every branch acts on the real engine — the
    // page used to have none of these, so its rows could not be managed at all.
    const [verb, watchId] = intent.split(":");
    const monitor = runtime?.monitor;
    if (!monitor) {
      await toTab({ action: "status", text: "Monitoring isn't running yet." });
      return;
    }

    if (verb === "watch.add") {
      const url = await activeTabUrl();
      if (!url || url.startsWith("chrome") || url.startsWith("edge") || url.startsWith("about")) {
        await toTab({ action: "status", text: "Open a normal page first, then add it to Monitor." });
        return;
      }
      monitor.add({ url, kind: "content_change", intervalSec: 900, keep: true });
      await toTab({ action: "status", text: `Now watching this page every 15 minutes.` });
    } else if (verb === "watch.check" && watchId) {
      const events = await monitor.check(watchId);
      await toTab({
        action: "status",
        text:
          events.length > 0
            ? `Found ${events.length} change${events.length === 1 ? "" : "s"}.`
            : "No change — it compares against the last reading.",
      });
    } else if (verb === "watch.notify" && watchId) {
      // The monitor already raises an OS notification plus an avatar alert on
      // every detected change, so this explains that rather than pretending to
      // toggle something it cannot toggle yet.
      await toTab({
        action: "status",
        text: "You'll be told the moment this watch finds a change.",
      });
    } else if (verb === "watch.remove" && watchId) {
      monitor.remove(watchId);
      await toTab({ action: "status", text: "Stopped watching that page." });
    } else if ((verb === "watch.pause" || verb === "watch.resume") && watchId) {
      // Armed/disarmed lives on the engine's own watch state, so this changes
      // what the scheduler actually does rather than just what the row shows.
      try {
        const record = await monitor.engine.store.get(watchId);
        if (record) {
          await monitor.engine.store.setState(watchId, {
            ...record.state,
            armed: verb === "watch.resume",
          });
        }
        await toTab({
          action: "status",
          text: verb === "watch.resume" ? "Resumed that watch." : "Paused that watch.",
        });
      } catch {
        await toTab({ action: "status", text: "Couldn't change that watch." });
      }
    } else {
      await toTab({ action: "status", text: "That watch action isn't supported." });
    }

    await broadcastState();
    return;
  }
  if (intent === "vault.visibility") {
    // `key:shared` or `key:locked` — the user moving one field between them.
    const [key, visibility] = (text ?? "").split(":");
    if (key && (visibility === "shared" || visibility === "locked")) {
      try {
        await vault.setVisibility(key, visibility);
        await toTab({
          action: "status",
          text: visibility === "locked" ? `${key} is now locked.` : `${key} is now shareable.`,
        });
      } catch {
        await toTab({ action: "status", text: `Couldn't change ${key}.` });
      }
    }
    await broadcastState();
    return;
  }
  if (intent === "vault.lock") {
    vault.lock();
    await toTab({ action: "status", text: "Vault locked." });
    await broadcastState();
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

  // Start the engines that keep running between commands. This is what makes
  // tracking and reminders actually fire — without it they are dead code.
  runtime = createUnifiedRuntime({
    bus,
    say: (text) => toTab({ action: "say", text }),
    status: (text) => toTab({ action: "status", text }),
    play: (state) => toTab({ action: "play", state }),
  });
  runtime.install();

  // A reminder's one-shot alarm (and the monitor's repeating tick) arrive here.
  browser.alarms.onAlarm.addListener((alarm: { name: string }) => {
    void runtime?.handleAlarm(alarm.name).then(() => broadcastState());
  });

  // Tell whoever is listening — the panel may already be open.
  void broadcastState();

  // The avatar follows the user: one live scene, moved on tab switch rather than
  // rebuilt in every tab.
  browser.tabs.onActivated.addListener((info: { tabId: number }) => {
    void claimAvatar(info.tabId);
  });
  browser.windows.onFocusChanged.addListener(() => {
    void syncAvatarToActiveTab();
  });
  browser.tabs.onRemoved.addListener((tabId: number) => {
    if (tabId === avatarTabId) avatarTabId = undefined;
  });
  void syncAvatarToActiveTab();

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

  browser.runtime.onMessage.addListener((raw: unknown, sender?: { tab?: { id?: number } }) => {
    const message = raw as
      | { type?: string; intent?: string; text?: string; confirmationId?: string }
      | undefined;
    if (!message) return undefined;

    // A content script announcing itself: mount the avatar only if this is the
    // tab the user is looking at.
    if (message.type === "diggy:hello") {
      void onTabHello(sender?.tab?.id);
      return undefined;
    }

    /*
     * The avatar's card buttons.
     *
     * "Open" used to re-enter the agent loop with the words "Open <url>", which
     * meant the model got another turn to think about it and could answer instead
     * of navigating — that is the "click, then it redirects" behaviour. The user
     * has already decided by pressing the button, so this navigates directly.
     */
    if (message.type === "diggy:card-action") {
      const action = (raw as { action?: string }).action;
      const url = (raw as { url?: string }).url;
      if (action === "open" && url) {
        void (async () => {
          try {
            const tabId = await activeTabId();
            if (tabId != null) await browser.tabs.update(tabId, { url });
            await toTab({ action: "card", card: null });
          } catch {
            await toTab({ action: "status", text: "Couldn't open that page." });
          }
        })();
      }
      return undefined;
    }

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
