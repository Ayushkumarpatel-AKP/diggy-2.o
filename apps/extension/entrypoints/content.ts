/**
 * Page content script — mounts the DIGGY companion.
 *
 * The living FBX avatar (Chiori) is pinned to the bottom-right corner of every
 * page, inside a Shadow DOM so page CSS can never break it, and inside a
 * full-viewport host that is `pointer-events: none` everywhere except the
 * avatar's own box — so it never blocks the page.
 *
 * NOTE (demo posture): this is currently a *static* content script so the
 * companion is visible immediately. The production posture keeps host access
 * optional and registers the script on demand (`registration: "runtime"`);
 * see agents/STATUS.md.
 */
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { Avatar } from "@diggy/avatar";
import type { AvatarProps } from "@diggy/avatar";

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

    const avatarProps: AvatarProps = {
      assetBase: resolveUrl("assets/avatar"),
      size: 140,
      corner: "bottom-right",
      fps: 24,
    };
    const root = createRoot(mount);
    root.render(createElement(Avatar, avatarProps));

    ctx.onInvalidated(() => {
      root.unmount();
      host.remove();
    });
  },
});
