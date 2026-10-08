/**
 * Page content script — mounts the DIGGY companion and owns the two things that
 * must run in the page: dictation and speech.
 *
 * - **Dictation**: Ctrl+Space opens the microphone (Web Speech recognition) and
 *   whatever you say appears live in the avatar's bubble. Ctrl+Space again closes
 *   the mic and the transcript goes to the model.
 * - **Speech**: the reply is spoken with a natural female voice (the best voice the
 *   browser offers for the configured language).
 *
 * The avatar itself is pinned bottom-left inside a Shadow DOM, in a full-viewport
 * host that is `pointer-events: none` everywhere except the avatar box.
 */
import { createElement, createRef } from "react";
import { createRoot } from "react-dom/client";
import { Avatar } from "@diggy/avatar";
import type { AvatarHandle, AvatarProps } from "@diggy/avatar";
import type { AvatarState } from "@diggy/shared";

/** Messages the background sends to drive the on-page avatar. */
interface AvatarMessage {
  type: "diggy:avatar";
  action: "say" | "status" | "play";
  text?: string;
  state?: AvatarState;
}

function isAvatarMessage(value: unknown): value is AvatarMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "diggy:avatar"
  );
}

/* --- Web Speech recognition (prefixed API; minimal local typings) --------- */

interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: RecognitionAlternative;
}
interface RecognitionResults {
  readonly length: number;
  readonly [index: number]: RecognitionResult;
}
interface RecognitionEvent {
  readonly resultIndex: number;
  readonly results: RecognitionResults;
}
interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => RecognitionLike;

function recognitionCtor(): RecognitionCtor | null {
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

/* --- speech synthesis: pick the most natural female voice ---------------- */

const FEMALE = /aria|jenny|neerja|swara|zira|samantha|michelle|emma|ava|clara|libby|sonia|natasha|female|google (uk|us) english/i;
const NATURAL = /natural|online|neural/i;

function pickVoice(synth: SpeechSynthesis, lang: string): SpeechSynthesisVoice | null {
  const voices = synth.getVoices();
  if (!voices.length) return null;
  const want = lang.slice(0, 2).toLowerCase();
  const score = (voice: SpeechSynthesisVoice): number => {
    const name = voice.name.toLowerCase();
    let value = 0;
    if (voice.lang.toLowerCase().startsWith(want)) value += 4;
    if (NATURAL.test(name)) value += 3;
    if (FEMALE.test(name)) value += 2;
    if (/^en/i.test(voice.lang)) value += 1;
    return value;
  };
  return [...voices].sort((a, b) => score(b) - score(a))[0] ?? null;
}

function speak(text: string, lang: string): void {
  const synth = (window as unknown as { speechSynthesis?: SpeechSynthesis }).speechSynthesis;
  const Utterance = (window as unknown as { SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance })
    .SpeechSynthesisUtterance;
  const clean = text.trim();
  if (!synth || !Utterance || !clean) return;
  synth.cancel();

  const say = (): void => {
    const utterance = new Utterance(clean);
    const voice = pickVoice(synth, lang);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = lang;
    }
    utterance.rate = 1.02;
    utterance.pitch = 1.12;
    synth.speak(utterance);
  };

  if (synth.getVoices().length === 0) {
    // Voices load asynchronously the first time; wait briefly, then speak anyway.
    let done = false;
    const run = (): void => {
      if (done) return;
      done = true;
      say();
    };
    synth.addEventListener("voiceschanged", run, { once: true });
    window.setTimeout(run, 400);
  } else {
    say();
  }
}

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",
  main(ctx) {
    const parent = document.body ?? document.documentElement;
    if (!parent) return;

    const host = document.createElement("div");
    host.setAttribute("data-diggy-host", "");
    host.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483646;";
    const shadow = host.attachShadow({ mode: "open" });
    const mount = document.createElement("div");
    mount.style.cssText = "position:fixed;inset:0;pointer-events:none;";
    shadow.appendChild(mount);
    parent.appendChild(host);

    // `browser.runtime.getURL` is typed against WXT's generated `PublicPath`
    // union, which lists files rather than the `assets/avatar` directory.
    const resolveUrl = browser.runtime.getURL as (path: string) => string;
    const handleRef = createRef<AvatarHandle>();

    const avatarProps: AvatarProps = {
      assetBase: resolveUrl("assets/avatar"),
      size: 140,
      corner: "bottom-left",
      fps: 24,
    };
    const root = createRoot(mount);
    root.render(createElement(Avatar, { ...avatarProps, ref: handleRef }));

    /* --- dictation ------------------------------------------------------- */
    let language = "en-IN";
    let recognition: RecognitionLike | null = null;
    let settled = "";

    const post = (message: unknown): void => {
      void browser.runtime.sendMessage(message).catch(() => undefined);
    };

    function startDictation(): void {
      if (recognition) return;
      const Ctor = recognitionCtor();
      if (!Ctor) {
        handleRef.current?.status("Voice isn't supported in this browser.");
        post({ type: "diggy:dictate-final", text: "" });
        post({ type: "diggy:dictate-end" });
        return;
      }

      settled = "";
      const rec = new Ctor();
      rec.lang = language;
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      rec.onresult = (event) => {
        let interim = "";
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          const transcript = result?.[0]?.transcript ?? "";
          if (result?.isFinal) settled += `${transcript} `;
          else interim += transcript;
        }
        const live = `${settled}${interim}`.trim();
        handleRef.current?.status(live ? `🎤 ${live}` : "🎤 Listening…");
        post({ type: "diggy:dictate-interim", text: live });
      };
      rec.onerror = () => {
        /* surfaced through onend below */
      };
      rec.onend = () => {
        recognition = null;
        post({ type: "diggy:dictate-final", text: settled.trim() });
        post({ type: "diggy:dictate-end" });
        settled = "";
      };

      recognition = rec;
      try {
        rec.start();
      } catch {
        recognition = null;
      }
    }

    function stopDictation(): void {
      try {
        recognition?.stop();
      } catch {
        /* already stopped */
      }
    }

    /* --- messages -------------------------------------------------------- */
    const onMessage = (raw: unknown): unknown => {
      const message = raw as { type?: string; action?: string; lang?: string } | undefined;

      // Page reading for the runtime. We are already in the page, so this needs
      // no host permission — unlike `chrome.scripting.executeScript`.
      if (message?.type === "diggy:read") {
        const text = (document.body?.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 6000);
        return Promise.resolve({ text, url: location.href, title: document.title });
      }

      if (message?.type === "diggy:dictate") {
        if (typeof message.lang === "string" && message.lang) language = message.lang;
        if (message.action === "start") startDictation();
        else stopDictation();
        return undefined;
      }

      if (!isAvatarMessage(raw)) return undefined;
      const avatar = handleRef.current;
      if (!avatar) return undefined;
      if (raw.action === "say" && raw.text) {
        avatar.say(raw.text, "speaking");
        speak(raw.text, language);
      } else if (raw.action === "status" && raw.text) {
        avatar.status(raw.text);
      } else if (raw.action === "play" && raw.state) {
        avatar.play(raw.state);
      }
      return undefined;
    };

    browser.runtime.onMessage.addListener(onMessage);

    ctx.onInvalidated(() => {
      browser.runtime.onMessage.removeListener(onMessage);
      stopDictation();
      handleRef.current?.play("exit");
      root.unmount();
      host.remove();
    });
  },
});
