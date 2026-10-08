import { BusEvents, createBus } from "@diggy/shared";
import { createBrainRegistry, createGroqProvider } from "@diggy/core";
import {
  createTranscriber,
  OFFSCREEN,
  VoiceSession,
  VOICE_STATUS,
  type VoiceRecorder,
} from "@diggy/voice";

import { bindPushToTalk, type CommandsApi, type RuntimeMessageApi } from "../src/shortcut.js";

/**
 * Extension background service worker.
 *
 * Owns the shared plumbing (bus, side panel, storage) and the push-to-talk voice
 * pipeline: the mic lives in the offscreen document, STT + chat go through
 * `@diggy/core` (Groq primary → NVIDIA NIM failover) using the user's own key
 * from storage, and replies are spoken by the offscreen browser voice and shown
 * by the on-page avatar.
 */
const bus = createBus({ source: "background" });

/** Where the user's own provider keys live (set in DIGGY settings). */
export const PROVIDER_KEYS_STORAGE = "diggy:providers";

interface ProviderKeys {
  groq?: string;
  nvidia?: string;
}

async function readKeys(): Promise<ProviderKeys> {
  try {
    const stored = await browser.storage.local.get(PROVIDER_KEYS_STORAGE);
    return (stored[PROVIDER_KEYS_STORAGE] as ProviderKeys | undefined) ?? {};
  } catch {
    return {};
  }
}

/** The companion's voice: short, plain, spoken out loud. */
const PERSONA = [
  "You are DIGGY, a friendly browser companion that lives in the corner of the page.",
  "Answer the user's spoken question conversationally and briefly: one or two short sentences,",
  "plain language, no markdown, no lists, no emoji. If you do not know, say so plainly.",
].join(" ");

/** `sidePanel` is a valid MV3 API but missing from WXT 0.19 browser typings. */
interface SidePanelApi {
  setPanelBehavior(options: { openPanelOnActionClick?: boolean }): Promise<void>;
}

function getSidePanel(): SidePanelApi | undefined {
  return (browser as unknown as { sidePanel?: SidePanelApi }).sidePanel;
}

/** `offscreen` is a valid MV3 API but missing from WXT 0.19 browser typings. */
interface OffscreenApi {
  hasDocument?(): Promise<boolean>;
  createDocument(options: {
    url: string;
    reasons: string[];
    justification: string;
  }): Promise<void>;
}

function getOffscreen(): OffscreenApi | undefined {
  return (browser as unknown as { offscreen?: OffscreenApi }).offscreen;
}

/** Create the offscreen audio host on demand (idempotent). */
async function ensureOffscreen(): Promise<void> {
  const offscreen = getOffscreen();
  if (!offscreen?.createDocument) return;
  try {
    if (offscreen.hasDocument && (await offscreen.hasDocument())) return;
    await offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["USER_MEDIA", "AUDIO_PLAYBACK"],
      justification: "Record push-to-talk audio and speak replies.",
    });
  } catch {
    // Already exists, or the runtime lacks the API — the recorder reports it.
  }
}

/* --- talking to the page's avatar ---------------------------------------- */

async function sendToTab(message: unknown): Promise<void> {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id != null) await browser.tabs.sendMessage(tab.id, message);
  } catch {
    // No active tab, or no content script in it — nothing to show.
  }
}

function toTab(payload: { action: "say" | "status"; text: string }): Promise<void> {
  return sendToTab({ type: "diggy:avatar", ...payload });
}

/* --- voice pipeline ------------------------------------------------------ */

/** Recorder adapter: the mic lives in the offscreen host. */
const recorder: VoiceRecorder = {
  async start() {
    await ensureOffscreen();
    const result = (await browser.runtime.sendMessage({
      type: OFFSCREEN.start,
      autoStop: false,
    })) as { ok: boolean; error?: string } | undefined;
    return result ?? { ok: false, error: "offscreen recorder unavailable" };
  },
  async stop() {
    const result = (await browser.runtime.sendMessage({ type: OFFSCREEN.stop })) as
      | { ok: boolean; base64?: string; mimeType?: string; error?: string }
      | undefined;
    return result ?? { ok: false, error: "offscreen recorder unavailable" };
  },
};

/** STT reads the key at call time so a key added in settings works immediately. */
const transcribe = async (
  audio: ArrayBuffer,
  opts?: { mimeType?: string; language?: string },
): Promise<string> => {
  const keys = await readKeys();
  if (!keys.groq) throw new Error("no-groq-key");
  return createTranscriber(createGroqProvider({ apiKey: keys.groq }))(audio, opts);
};

const voice = new VoiceSession({ recorder, transcribe, bus });

/** Ask the model and speak the answer. */
async function respond(transcript: string): Promise<void> {
  const keys = await readKeys();
  if (!keys.groq && !keys.nvidia) {
    await toTab({
      action: "status",
      text: "Add your Groq API key in DIGGY settings (options) to chat.",
    });
    return;
  }

  bus.emit(BusEvents.AvatarStatus, { text: VOICE_STATUS.thinking });

  let reply: string;
  try {
    const registry = createBrainRegistry({
      providers: {
        groq: keys.groq ? { apiKey: keys.groq } : {},
        "nvidia-nim": keys.nvidia ? { apiKey: keys.nvidia } : {},
      },
    });
    const result = await registry.chat({
      messages: [
        { role: "system", content: PERSONA },
        { role: "user", content: transcript },
      ],
      temperature: 0.3,
      maxTokens: 320,
    });
    reply = result.text.trim() || "I'm not sure how to answer that.";
  } catch (error) {
    reply = `Sorry, I could not reach the model. ${error instanceof Error ? error.message : ""}`.trim();
  }

  bus.emit(BusEvents.AvatarStatus, { text: VOICE_STATUS.speaking });
  await ensureOffscreen();
  await browser.runtime.sendMessage({ type: OFFSCREEN.say, text: reply }).catch(() => undefined);
  await toTab({ action: "say", text: reply });
  bus.emit(BusEvents.AvatarStatus, { text: "" });
}

/* --- dashboard actions --------------------------------------------------- */

/** Page content, read through the content script (already injected, no host permission). */
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

async function speak(text: string): Promise<void> {
  await ensureOffscreen();
  await browser.runtime.sendMessage({ type: OFFSCREEN.say, text }).catch(() => undefined);
  await toTab({ action: "say", text });
}

/** Read the current page and answer a fixed question about it. */
async function assist(intent: string): Promise<void> {
  const keys = await readKeys();
  if (!keys.groq && !keys.nvidia) {
    await toTab({ action: "status", text: "Add your Groq API key in DIGGY settings." });
    return;
  }

  bus.emit(BusEvents.AvatarStatus, { text: VOICE_STATUS.thinking });
  const page = await readPage();
  const question = ASSIST_PROMPTS[intent] ?? "Help me with this page.";
  const context = page ? `Page: ${page.title} — ${page.url}\n\n${page.text}` : "(No page content.)";

  let reply: string;
  try {
    const registry = createBrainRegistry({
      providers: {
        groq: keys.groq ? { apiKey: keys.groq } : {},
        "nvidia-nim": keys.nvidia ? { apiKey: keys.nvidia } : {},
      },
    });
    const result = await registry.chat({
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

  bus.emit(BusEvents.AvatarStatus, { text: VOICE_STATUS.speaking });
  await speak(reply);
  bus.emit(BusEvents.AvatarStatus, { text: "" });
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

/** A button in the side panel asked for something. */
async function handleAction(intent: string | undefined): Promise<void> {
  if (!intent) return;
  if (intent === "voice") {
    await voice.toggle();
    return;
  }
  if (intent === "track") {
    await track();
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

  // CTRL+SPACE → press/release, plus VOICE_CONTROL from pages that see real key events.
  bindPushToTalk(voice, {
    commands: browser.commands as unknown as CommandsApi,
    runtime: browser.runtime as unknown as RuntimeMessageApi,
  });

  // The offscreen recorder asks to stop on silence / cap; the session transcribes.
  // The side panel asks for page work with `diggy:action`.
  browser.runtime.onMessage.addListener((raw: unknown) => {
    const message = raw as { type?: string; intent?: string } | undefined;
    if (message?.type === OFFSCREEN.silence) {
      void voice.onSilence("silence");
    }
    if (message?.type === "diggy:action") {
      void handleAction(message.intent);
    }
    return undefined;
  });

  // A finished transcript → ask the model → speak + show the answer.
  bus.on<{ text?: string }>(BusEvents.VoiceTranscript, (event) => {
    const text = event.payload?.text;
    if (text) void respond(text);
  });

  // Status lines (Listening… / Transcribing… / Thinking…) ride to the page avatar.
  bus.on<{ text?: string }>(BusEvents.AvatarStatus, (event) => {
    void toTab({ action: "status", text: event.payload?.text ?? "" });
  });
});
