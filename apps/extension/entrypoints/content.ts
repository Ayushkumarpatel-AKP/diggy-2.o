/**
 * Page content script — mounts the DIGGY companion.
 *
 * The living FBX avatar (Chiori) is pinned to the bottom-right corner of every
 * page, inside a Shadow DOM so page CSS can never break it, and inside a
 * full-viewport host that is `pointer-events: none` everywhere except the
 * avatar's own box — so it never blocks the page.
 *
 * The background drives it for voice: it sends `diggy:avatar` messages to make
 * the avatar speak a reply or show a status line. On teardown the companion
 * plays its `exit` animation.
 *
 * NOTE (demo posture): this is currently a *static* content script so the
 * companion is visible immediately. The production posture keeps host access
 * optional and registers the script on demand (`registration: "runtime"`);
 * see agents/STATUS.md.
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
    // union, which lists individual files rather than the `assets/avatar`
    // directory. The runtime accepts any relative path, so widen the signature.
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

    const onMessage = (raw: unknown): unknown => {
      const message = raw as { type?: string } | undefined;

      // Page reading for the runtime. We are already in the page, so this needs
      // no host permission — unlike `chrome.scripting.executeScript`.
      if (message?.type === "diggy:read") {
        const text = (document.body?.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 6000);
        return Promise.resolve({ text, url: location.href, title: document.title });
      }

      if (!isAvatarMessage(raw)) return undefined;
      const avatar = handleRef.current;
      if (!avatar) return undefined;
      if (raw.action === "say" && raw.text) avatar.say(raw.text, "speaking");
      else if (raw.action === "status" && raw.text) avatar.status(raw.text);
      else if (raw.action === "play" && raw.state) avatar.play(raw.state);
      return undefined;
    };
    browser.runtime.onMessage.addListener(onMessage);

    ctx.onInvalidated(() => {
      browser.runtime.onMessage.removeListener(onMessage);
      handleRef.current?.play("exit");
      root.unmount();
      host.remove();
    });
  },
});
