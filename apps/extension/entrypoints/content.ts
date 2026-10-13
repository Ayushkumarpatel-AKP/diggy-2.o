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
import type { AvatarHandle, AvatarCard, AvatarProps } from "@diggy/avatar";
import { createToolHost } from "@diggy/page-agent";
import type { AvatarState } from "@diggy/shared";
import {
  POINTER_HIDE_MS,
  initialPointerState,
  reducePointer,
  type PointerMessage,
  type PointerState,
} from "../src/pointer.js";

/** Messages the background sends to drive the on-page avatar. */
interface AvatarMessage {
  type: "diggy:avatar";
  action: "say" | "status" | "play" | "mount" | "unmount" | "card";
  text?: string;
  state?: AvatarState;
  card?: AvatarCard | null;
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

    /* --- the visible pointer --------------------------------------------- */

    /*
     * A purely visual cursor that tracks real actions. It is driven only by
     * `diggy:pointer` messages, which the background sends from actual tool
     * results — so it can never show a click that did not happen. It draws inside
     * the same click-through Shadow DOM as the avatar, so it never intercepts the
     * user's own input.
     */
    const pointerLayer = document.createElement("div");
    pointerLayer.setAttribute("data-diggy-pointer", "");
    pointerLayer.style.cssText = "position:fixed;inset:0;pointer-events:none;overflow:hidden;";

    const ring = document.createElement("div");
    ring.style.cssText =
      "position:absolute;left:0;top:0;border:2px solid #e0a63a;border-radius:6px;" +
      "box-shadow:0 0 0 3px rgba(224,166,58,.22);opacity:0;" +
      "transition:opacity .12s ease,transform .18s ease,width .12s ease,height .12s ease;";
    const dot = document.createElement("div");
    dot.style.cssText =
      "position:absolute;left:0;top:0;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;" +
      "background:rgba(224,166,58,.95);border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3);" +
      "opacity:0;transition:left .22s ease,top .22s ease,opacity .12s ease;";
    const pointerLabel = document.createElement("div");
    pointerLabel.style.cssText =
      "position:absolute;left:0;top:0;max-width:260px;padding:2px 8px;border-radius:999px;" +
      "background:rgba(28,28,30,.88);color:#fff;font:12px/1.5 system-ui,sans-serif;" +
      "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:0;" +
      "transition:opacity .12s ease,left .22s ease,top .22s ease;";
    pointerLayer.append(ring, dot, pointerLabel);
    shadow.appendChild(pointerLayer);

    let pointerState: PointerState = initialPointerState();
    let pointerTimer: number | null = null;
    const reducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function renderPointer(): void {
      const state = pointerState;
      if (!state.visible) {
        ring.style.opacity = "0";
        dot.style.opacity = "0";
        pointerLabel.style.opacity = "0";
        return;
      }
      if (state.bbox) {
        const cx = state.bbox.x + state.bbox.width / 2;
        const cy = state.bbox.y + state.bbox.height / 2;
        dot.style.left = `${cx}px`;
        dot.style.top = `${cy}px`;
        ring.style.transform = `translate(${state.bbox.x}px, ${state.bbox.y}px)`;
        ring.style.width = `${state.bbox.width}px`;
        ring.style.height = `${state.bbox.height}px`;
        pointerLabel.style.left = `${state.bbox.x}px`;
        pointerLabel.style.top = `${Math.max(0, state.bbox.y - 24)}px`;
      }
      ring.style.opacity = state.action === "click" || state.action === "type" ? "1" : "0";
      dot.style.opacity = "1";
      pointerLabel.textContent = state.label;
      pointerLabel.style.opacity = state.label ? "1" : "0";

      if (!reducedMotion && state.action === "click" && typeof dot.animate === "function") {
        dot.animate(
          [{ transform: "scale(1)" }, { transform: "scale(2.4)", opacity: 0.2 }, { transform: "scale(1)", opacity: 1 }],
          { duration: 420, easing: "ease-out" },
        );
      }
    }

    function schedulePointerHide(): void {
      if (pointerTimer !== null) window.clearTimeout(pointerTimer);
      pointerTimer = window.setTimeout(() => {
        pointerState = reducePointer(pointerState, { action: "idle" });
        renderPointer();
      }, POINTER_HIDE_MS);
    }


    // `browser.runtime.getURL` is typed against WXT's generated `PublicPath`
    // union, which lists files rather than the `assets/avatar` directory.
    const resolveUrl = browser.runtime.getURL as (path: string) => string;
    const handleRef = createRef<AvatarHandle>();

    const avatarProps: AvatarProps = {
      assetBase: resolveUrl("assets/avatar"),
      // Bigger than the original 140 so the speech bubble above the character has
      // room for a wrapped line and a clickable link.
      size: 200,
      corner: "bottom-left",
      fps: 24,
    };

    /*
     * The avatar is expensive: a 17 MB VRM, eleven clips and a WebGL context.
     * Building one in every tab means every new tab pays for a scene nobody is
     * looking at — which is exactly the lag.
     *
     * So it is **lazy and singular**: nothing is created here, and the background
     * tells only the tab the user is actually looking at to mount. Switching tabs
     * unmounts the old one first, so at most one live avatar exists at a time and
     * the GL context is released rather than left running off-screen.
     */
    let root: ReturnType<typeof createRoot> | null = null;
    /** The result card currently shown in the avatar's bubble. */
    let currentCard: AvatarCard | null = null;

    function mountAvatar(): void {
      if (root) return;
      root = createRoot(mount);
      renderAvatar();
    }

    function renderAvatar(): void {
      if (!root) return;
      root.render(
        createElement(Avatar, {
          ...avatarProps,
          ref: handleRef,
          card: currentCard,
          // The card's buttons live in the page, so they report back over the
          // same message channel the panel uses.
          onCardAction: (action: "open" | "dismiss") => {
            const target = currentCard?.targetUrl;
            currentCard = null;
            renderAvatar();
            if (action === "open" && target) {
              post({ type: "diggy:card-action", action: "open", url: target });
            }
          },
        }),
      );
    }

    function unmountAvatar(): void {
      if (!root) return;
      const current = root;
      root = null;
      // Clearing the ref first stops a late frame from touching a dead scene.
      (handleRef as { current: AvatarHandle | null }).current = null;
      try {
        current.unmount();
      } catch {
        /* unmounting twice is harmless */
      }
    }

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

    // The Action Engine, driven by the service worker's agent loop. This is what
    // lets DIGGY read, click, type, scroll and fill the page it is on.
    const toolHost = createToolHost();

    const onMessage = (raw: unknown): unknown => {
      if (toolHost.claims(raw)) return toolHost.handle(raw);

      const message = raw as { type?: string; action?: string; lang?: string } | undefined;

      // Page reading for the runtime. We are already in the page, so this needs
      // no host permission — unlike `chrome.scripting.executeScript`.
      if (message?.type === "diggy:read") {
        const text = (document.body?.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 6000);
        return Promise.resolve({ text, url: location.href, title: document.title });
      }

      // A real action landed: show the user where, as a purely visual pointer.
      if (message?.type === "diggy:pointer") {
        pointerState = reducePointer(pointerState, raw as PointerMessage);
        renderPointer();
        schedulePointerHide();
        return undefined;
      }

      if (message?.type === "diggy:dictate") {
        if (typeof message.lang === "string" && message.lang) language = message.lang;
        if (message.action === "start") startDictation();
        else stopDictation();
        return undefined;
      }

      if (!isAvatarMessage(raw)) return undefined;

      // Lifecycle first: everything below needs a mounted avatar.
      if (raw.action === "mount") {
        mountAvatar();
        return undefined;
      }
      if (raw.action === "unmount") {
        unmountAvatar();
        return undefined;
      }

      // A result card for the avatar's own bubble: thumbnail, text, Open/Dismiss.
      if (raw.action === "card") {
        currentCard = raw.card ?? null;
        mountAvatar();
        renderAvatar();
        return undefined;
      }

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

    // A visible tab renders the avatar; a hidden one does not. That is the
    // primary rule, and it is deliberately local: the earlier version waited for
    // the background to reply "mount", so a single missed round trip left the
    // user with no avatar and nothing to retry it.
    //
    // The background still unmounts non-active tabs on activation change, so the
    // "only one live avatar" guarantee holds — this just makes it robust when the
    // handshake does not land.
    if (!document.hidden) mountAvatar();
    post({ type: "diggy:hello" });

    const onVisibility = (): void => {
      if (document.hidden) unmountAvatar();
      else mountAvatar();
    };
    document.addEventListener("visibilitychange", onVisibility);

    ctx.onInvalidated(() => {
      browser.runtime.onMessage.removeListener(onMessage);
      document.removeEventListener("visibilitychange", onVisibility);
      if (pointerTimer !== null) window.clearTimeout(pointerTimer);
      stopDictation();
      handleRef.current?.play("exit");
      unmountAvatar();
      host.remove();
    });
  },
});
