import { BusEvents, createBus, type Provider } from "@diggy/shared";
import { createTranscriber, OFFSCREEN, VoiceSession, type VoiceRecorder } from "@diggy/voice";

import { bindPushToTalk, type CommandsApi, type RuntimeMessageApi } from "../src/shortcut.js";

/**
 * Extension background service worker.
 * Owns the shared plumbing (bus bootstrap, side panel, storage warm-up) and the
 * push-to-talk voice wiring: the mic lives in the offscreen document, and STT is
 * delegated to the backend so no provider key ever enters the bundle.
 */
const bus = createBus({ source: "background" });

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
      justification: "Record push-to-talk audio and play spoken replies.",
    });
  } catch {
    // Already exists, or the runtime lacks the API — the recorder reports it.
  }
}

/** Recorder adapter: `VoiceSession` drives the mic that lives in the offscreen host. */
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

/** Backend base URL for server-side speech-to-text (Groq `whisper-large-v3`). */
const BACKEND_BASE_URL = "http://localhost:17323";

/**
 * STT goes through the backend proxy so the provider key stays server-side. The
 * `Provider` shape is satisfied locally; only `transcribe` is used here.
 */
const sttProvider: Provider = {
  id: "backend-stt",
  label: "DIGGY backend STT",
  chat: () => Promise.reject(new Error("chat is not used for speech-to-text")),
  async transcribe(audio, opts) {
    const response = await fetch(`${BACKEND_BASE_URL}/api/stt`, {
      method: "POST",
      headers: { "content-type": opts?.language ? "audio/webm" : "audio/webm" },
      body: audio,
    });
    if (!response.ok) throw new Error(`STT failed (${response.status})`);
    const data = (await response.json()) as { text?: string };
    return data.text ?? "";
  },
};

const voice = new VoiceSession({ recorder, transcribe: createTranscriber(sttProvider), bus });

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
  browser.runtime.onMessage.addListener((raw: unknown) => {
    const message = raw as { type?: string } | undefined;
    if (message?.type === OFFSCREEN.silence) {
      void voice.onSilence("silence");
    }
    return undefined;
  });
});
