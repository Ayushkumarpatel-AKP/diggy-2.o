import { BusEvents, createBus } from "@diggy/shared";
import { createOpenAICompatibleProvider } from "@diggy/core";
import { VOICE_STATUS } from "@diggy/voice";

import {
  normalizeSettings,
  presetById,
  SETTINGS_KEY,
  settingsReady,
  type ProviderSettings,
} from "../src/provider-settings.js";
import { bindPushToTalk, type CommandsApi, type RuntimeMessageApi } from "../src/shortcut.js";

/**
 * Extension background service worker.
 *
 * Owns the shared plumbing and the voice loop:
 *
 *   Ctrl+Space  → start dictation; the page shows what you are saying live
 *   Ctrl+Space  → stop; the transcript goes to the model, and the answer is
 *                 spoken (natural voice) + shown on the avatar.
 *
 * The model is whatever the user configured in Settings — any OpenAI-compatible
 * source. Page reading and speech happen in the content script, so no host
 * permission is needed beyond the provider origin the user grants on save.
 */
const bus = createBus({ source: "background" });

async function readSettings(): Promise<ProviderSettings> {
  try {
    const stored = await browser.storage.local.get(SETTINGS_KEY);
    return normalizeSettings(stored[SETTINGS_KEY]);
  } catch {
    return normalizeSettings(undefined);
  }
}

/** Build a provider from the user's settings (or throw a readable reason). */
function buildProvider(settings: ProviderSettings) {
  const preset = presetById(settings.presetId);
  return createOpenAICompatibleProvider({
    id: settings.presetId,
    label: preset?.label ?? settings.presetId,
    baseURL: settings.baseUrl,
    apiKey: settings.apiKey.trim() || undefined,
    model: settings.model,
    sttModel: settings.sttModel || undefined,
  });
}

/** The companion's voice: short, plain, spoken out loud. */
const PERSONA = [
  "You are DIGGY, a friendly female browser companion that lives in the corner of the page.",
  "Answer conversationally and briefly: one or two short sentences, plain language,",
  "no markdown, no lists, no emoji. If you do not know, say so plainly.",
].join(" ");

/** `sidePanel` is a valid MV3 API but missing from WXT 0.19 browser typings. */
interface SidePanelApi {
  setPanelBehavior(options: { openPanelOnActionClick?: boolean }): Promise<void>;
}

function getSidePanel(): SidePanelApi | undefined {
  return (browser as unknown as { sidePanel?: SidePanelApi }).sidePanel;
}

/* --- talking to the page ------------------------------------------------- */

async function sendToTab(message: unknown): Promise<void> {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id != null) await browser.tabs.sendMessage(tab.id, message);
  } catch {
    // No active tab, or no content script in it.
  }
}

function toTab(payload: { action: "say" | "status" | "play"; text?: string }): Promise<void> {
  return sendToTab({ type: "diggy:avatar", ...payload });
}

async function setStatus(text: string): Promise<void> {
  bus.emit(BusEvents.AvatarStatus, { text });
  await toTab({ action: "status", text });
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
  await respond(text);
}

/** Ctrl+Space drives this: press → listen, press again → answer. */
const dictateHost = {
  get state(): string {
    return dictation.active ? "listening" : "idle";
  },
  press: () => startDictation(),
  release: () => stopDictation(),
  toggle: () => (dictation.active ? stopDictation() : startDictation()),
};

/* --- answering ----------------------------------------------------------- */

/** Ask the model and speak + show the answer. */
async function respond(prompt: string): Promise<void> {
  const settings = await readSettings();
  if (!settingsReady(settings)) {
    await toTab({ action: "status", text: "Add your API key in DIGGY settings to chat." });
    return;
  }

  await setStatus(VOICE_STATUS.thinking);

  let reply: string;
  try {
    const provider = buildProvider(settings);
    const result = await provider.chat({
      messages: [
        { role: "system", content: PERSONA },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      maxTokens: 320,
    });
    reply = result.text.trim() || "I'm not sure how to answer that.";
  } catch (error) {
    reply = `Sorry, I could not reach the model. ${error instanceof Error ? error.message : ""}`.trim();
  }

  await setStatus(VOICE_STATUS.speaking);
  await toTab({ action: "say", text: reply });
  await setStatus("");
}

/* --- dashboard actions --------------------------------------------------- */

/** Page content, read through the content script (already injected). */
async function readPage(): Promise<{ text: string; url: string; title: string } | null> {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id == null) return null;
    const page = (await browser.tabs.sendMessage(tab.id, { type: "diggy:read" })) as
      | { text: string; url: string; title: string }
      | undefined;
    return page ?? null;
  } catch {
    return null;
  }
}

const ASSIST_PROMPTS: Record<string, string> = {
  summarize: "Summarise this page in three to five short sentences.",
  explain: "Explain what this page is about, in plain language.",
  extract: "Extract the most important facts, dates and numbers from this page.",
  repository: "Analyse this repository page: what it is, its stack, and how active it looks.",
  opportunities: "List any deadlines, eligibility rules or opportunities on this page.",
};

/** Read the current page and answer a fixed question about it. */
async function assist(intent: string): Promise<void> {
  const settings = await readSettings();
  if (!settingsReady(settings)) {
    await toTab({ action: "status", text: "Add your API key in DIGGY settings." });
    return;
  }

  await setStatus(VOICE_STATUS.thinking);
  const page = await readPage();
  const question = ASSIST_PROMPTS[intent] ?? "Help me with this page.";
  const context = page ? `Page: ${page.title} — ${page.url}\n\n${page.text}` : "(No page content.)";

  let reply: string;
  try {
    const provider = buildProvider(settings);
    const result = await provider.chat({
      messages: [
        { role: "system", content: PERSONA },
        { role: "user", content: `${question}\n\n${context}` },
      ],
      temperature: 0.3,
      maxTokens: 420,
    });
    reply = result.text.trim() || "I could not read that page.";
  } catch (error) {
    reply = `Sorry, I could not reach the model. ${error instanceof Error ? error.message : ""}`.trim();
  }

  await setStatus(VOICE_STATUS.speaking);
  await toTab({ action: "say", text: reply });
  await setStatus("");
}

/** Remember the current page as something to watch. */
async function track(): Promise<void> {
  const page = await readPage();
  if (!page) {
    await toTab({ action: "status", text: "Open a page first, then track it." });
    return;
  }
  try {
    const stored = await browser.storage.local.get("diggy:watches");
    const watches = (stored["diggy:watches"] as unknown[] | undefined) ?? [];
    watches.unshift({ url: page.url, title: page.title, addedAt: Date.now() });
    await browser.storage.local.set({ "diggy:watches": watches.slice(0, 50) });
  } catch {
    // Storage unavailable — the acknowledgement below still tells the user.
  }
  await toTab({ action: "status", text: `Tracking: ${page.title || page.url}` });
}

/** A button (or the composer) in the side panel asked for something. */
async function handleAction(intent: string | undefined, text?: string): Promise<void> {
  if (!intent) return;
  if (intent === "voice") {
    await dictateHost.toggle();
    return;
  }
  if (intent === "track") {
    await track();
    return;
  }
  if (intent === "ask") {
    const prompt = (text ?? "").trim();
    if (prompt) await respond(prompt);
    return;
  }
  await assist(intent);
}

export default defineBackground(() => {
  bus.emit(BusEvents.AvatarStatus, { text: "DIGGY is ready" });

  browser.runtime.onInstalled.addListener(() => {
    const sidePanel = getSidePanel();
    if (!sidePanel) return;
    void sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((error: unknown) => console.error("[diggy] side panel behavior failed", error));
  });

  // Ctrl+Space toggles dictation; pages that see real key events get hold-to-talk.
  bindPushToTalk(dictateHost, {
    commands: browser.commands as unknown as CommandsApi,
    runtime: browser.runtime as unknown as RuntimeMessageApi,
  });

  browser.runtime.onMessage.addListener((raw: unknown) => {
    const message = raw as { type?: string; intent?: string; text?: string; final?: boolean } | undefined;

    if (message?.type === "diggy:action") {
      void handleAction(message.intent, message.text);
      return undefined;
    }
    // Live dictation: show what the user is saying, keep the settled text.
    if (message?.type === "diggy:dictate-interim" && typeof message.text === "string") {
      dictation.interim = message.text;
      void toTab({ action: "status", text: `🎤 ${message.text}` });
      return undefined;
    }
    if (message?.type === "diggy:dictate-final" && typeof message.text === "string") {
      dictation.final = message.text;
      return undefined;
    }
    if (message?.type === "diggy:dictate-end") {
      void finishDictation();
      return undefined;
    }
    return undefined;
  });
});
