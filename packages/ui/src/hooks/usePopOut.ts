/**
 * Detachable / pop-out panel (openbrowse `Alt+Space`).
 * Prefers the Document Picture-in-Picture API (Chrome) and falls back to a named popup
 * window that renders the same app URL, so the panel is genuinely detachable everywhere.
 *
 * // INTERFACE FOR INTEGRATION
 * interface PopOutOptions { url?: string; width?: number; height?: number; elementId?: string }
 * interface PopOutApi { supported: boolean; isOpen: boolean; mode: "pip" | "window";
 *   popOut(options?: PopOutOptions): Promise<void>; close(): void }
 * function usePopOut(defaults?: PopOutOptions): PopOutApi;
 * // END INTERFACE FOR INTEGRATION
 */
import { useCallback, useEffect, useRef, useState } from "react";

export interface PopOutOptions {
  url?: string;
  width?: number;
  height?: number;
  elementId?: string;
}

export interface PopOutApi {
  supported: boolean;
  isOpen: boolean;
  mode: "pip" | "window";
  popOut(options?: PopOutOptions): Promise<void>;
  close(): void;
}

interface DocPipWindow extends Window {
  documentPictureInPicture?: {
    requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
  };
}

export function usePopOut(defaults: PopOutOptions = {}): PopOutApi {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<"pip" | "window">("window");
  const handleRef = useRef<Window | null>(null);
  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;

  const pipSupported =
    typeof window !== "undefined" &&
    typeof (window as DocPipWindow).documentPictureInPicture?.requestWindow === "function";

  const popOut = useCallback(async (options: PopOutOptions = {}) => {
    const {
      width = 420,
      height = 720,
      elementId = "dg-popout-root",
      url,
    } = { ...defaultsRef.current, ...options };
    const pip = (window as DocPipWindow).documentPictureInPicture;
    if (pip?.requestWindow) {
      try {
        const pipWindow = await pip.requestWindow({ width, height });
        const source = document.getElementById(elementId);
        if (source) {
          const parent = source.parentElement;
          const anchor = document.createComment("dg-popout-anchor");
          parent?.insertBefore(anchor, source);
          pipWindow.document.body.style.margin = "0";
          for (const node of Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))) {
            pipWindow.document.head.append(node.cloneNode(true));
          }
          pipWindow.document.body.append(source);
          pipWindow.addEventListener("pagehide", () => {
            // Move the panel back to its original slot so the host page is never left empty.
            if (anchor.parentNode) {
              anchor.parentNode.insertBefore(source, anchor);
              anchor.remove();
            }
            handleRef.current = null;
            setIsOpen(false);
          });
        }
        handleRef.current = pipWindow;
        setMode("pip");
        setIsOpen(true);
        return;
      } catch {
        // Fall through to a popup window.
      }
    }
    const target = url ?? defaultsRef.current.url ?? (typeof location !== "undefined" ? location.href : "about:blank");
    const handle = window.open(
      target,
      "diggy-panel",
      `popup=yes,width=${width},height=${height},menubar=no,toolbar=no,location=no`,
    );
    handleRef.current = handle;
    setMode("window");
    setIsOpen(Boolean(handle));
  }, []);

  const close = useCallback(() => {
    const handle = handleRef.current;
    if (handle && !handle.closed) handle.close();
    handleRef.current = null;
    setIsOpen(false);
  }, []);

  useEffect(
    () => () => {
      const handle = handleRef.current;
      if (handle && !handle.closed) handle.close();
    },
    [],
  );

  return { supported: true, isOpen, mode: pipSupported ? "pip" : "window", popOut, close };
}
