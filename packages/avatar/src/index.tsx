/**
 * ============================================================================
 * INTERFACE FOR INTEGRATION  (@diggy/avatar)
 * ============================================================================
 * The public surface other workers code against. Mirrors
 * `packages/shared/src/contracts/avatar.ts` exactly.
 *
 *   type AvatarState =
 *     | "idle" | "blink" | "breathing" | "listening" | "thinking" | "speaking"
 *     | "walk" | "happy" | "success" | "warning" | "sleep" | "celebration"
 *     | "entry" | "stretch" | "exit";
 *   type AvatarExpression = Record<string, number>;
 *
 *   interface AvatarAPI {
 *     play(state: AvatarState): void;
 *     say(text: string, mood?: AvatarState): void;
 *     lookAt(target: "cursor" | "user" | "bubble" | { x: number; y: number }): void;
 *     setExpression(expression: AvatarExpression): void;
 *     status(text: string): void;      // "💭 …" line above the head
 *     setVisible(visible: boolean): void;
 *   }
 *
 *   interface AvatarCapabilityReport {
 *     source: "fbx" | "vrm";
 *     bones: string[];
 *     expressions: string[];
 *     clips: string[];
 *     triangles: number;
 *     warnings: string[];
 *   }
 *
 * React usage:
 *   const ref = useRef<AvatarHandle>(null);
 *   <Avatar ref={ref} assetBase="/assets/avatar" />;
 *   ref.current?.play("thinking");
 *
 * Non-React usage: `new AvatarController()` implements `AvatarAPI` and emits
 * snapshots via `subscribe` / `getSnapshot`.
 * ============================================================================
 */
import { Component, Suspense, forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { AvatarAPI, AvatarCapabilityReport, AvatarState } from "@diggy/shared";

import { AvatarController } from "./controller.js";
import type { AvatarLookAtTarget, AvatarRenderMode } from "./controller.js";
import { VrmAvatar } from "./VrmAvatar.js";

// --- Re-exports of the pure core (the integration surface) -----------------
export * from "./animations.js";
export * from "./state-machine.js";
export * from "./expressions.js";
export * from "./procedural.js";
export * from "./framing.js";
export * from "./capability.js";
export * from "./controller.js";
export { VrmAvatar } from "./VrmAvatar.js";
export type { VrmAvatarProps, VrmLookAt } from "./VrmAvatar.js";

/** Which screen corner the avatar is pinned to. */
export type AvatarCorner = "bottom-right" | "bottom-left" | "top-right" | "top-left";

/** Imperative handle exposed by the `<Avatar>` component. */
export interface AvatarHandle extends AvatarAPI {
  /** The headless controller backing this avatar. */
  readonly controller: AvatarController;
  /** The latest {@link AvatarCapabilityReport}, or `null`. */
  capability(): AvatarCapabilityReport | null;
  /** The active renderer mode. */
  mode(): AvatarRenderMode;
}

export interface AvatarProps {
  /** Base path where the VRM model + `animations/` live. Defaults to `/assets/avatar`. */
  assetBase?: string;
  /** VRM model file name. Defaults to `diggy_U.vrm`. */
  modelFile?: string;
  /** Target frame rate (brief: ≤30). Defaults to 30. */
  fps?: number;
  /** Screen corner to pin to. Defaults to `bottom-left`. */
  corner?: AvatarCorner;
  /** Rendered width in CSS pixels. Defaults to 200. */
  size?: number;
  /** Play the greeting (`entry`) once on mount. Defaults to true. */
  intro?: boolean;
  /** Walk in from the edge, then stretch and greet. Defaults to true. */
  walkIn?: boolean;
  /** Idle ambience: play `stretch` this often (ms). 0 disables. Defaults to 45000. */
  stretchEveryMs?: number;
  /**
   * A result to show in the bubble — a thumbnail, a title, and the text.
   *
   * Declarative rather than a new `AvatarAPI` method: the host re-renders with a
   * new card and React reconciles it, so nothing on the contract has to change.
   * While a card is shown it replaces the one-line status bubble, because a
   * thumbnail needs the room.
   */
  card?: AvatarCard | null;
  /** Called when the card's own buttons are pressed. */
  onCardAction?: (action: "open" | "dismiss") => void;
  /** External controller to drive; one is created internally otherwise. */
  controller?: AvatarController;
  /** Called once a renderer reports its capability. */
  onCapability?: (report: AvatarCapabilityReport) => void;
  /** Called when the renderer mode changes (e.g. FBX → VRM fallback). */
  onModeChange?: (mode: AvatarRenderMode, reason: string | null) => void;
  /** Extra content rendered inside the avatar box (host overlays). */
  children?: ReactNode;
  /** When true, show a compact icon instead of the full VRM model and status. */
  compact?: boolean;
}

/** A frame hook that lives inside the canvas so it can drive the controller. */
function FrameDriver({ onFrame }: { onFrame: (delta: number) => void }): null {
  useFrame((_, delta) => onFrame(delta));
  return null;
}

/**
 * Frames the whole character: the model stands on y=0 and is ~2.15 units tall,
 * so aim at its mid-point instead of the origin (which would show only the legs).
 */
function CameraRig(): null {
  const camera = useThree((state) => state.camera);
  useEffect(() => {
    camera.position.set(0, CAMERA_TARGET_Y, CAMERA_DISTANCE);
    camera.lookAt(0, CAMERA_TARGET_Y, 0);
    camera.updateProjectionMatrix();
  }, [camera]);
  return null;
}

/** Catches renderer load errors (notably the suspended VRM loader). */
class RendererBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(): void {
    // Swallow: a failed fallback simply renders nothing (never crashes the page).
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

const CORNER_OFFSET = 16;

/** Framing for the corner box: the model stands on y=0 and is ~2.15 units tall. */
const CAMERA_TARGET_Y = 1.15;
const CAMERA_DISTANCE = 4.6;

/** Entrance timing: the VRM walk-in runs first, then a happy beat, then idle. */
const WALK_IN_MS = 4200;
const GREET_MS = 2600;

function verticalEdge(corner: AvatarCorner, offset: number): CSSProperties {
  return corner.includes("top") ? { top: offset } : { bottom: offset };
}

function horizontalEdge(corner: AvatarCorner, offset: number): CSSProperties {
  return corner.includes("right") ? { right: offset } : { left: offset };
}

/**
 * The living avatar, pinned bottom-left of the page, rendering only inside its
 * own box (`pointer-events: none` everywhere else) so it never blocks content.
 *
 * `diggy_U.vrm` is the character; its clips come from `assets/avatar/animations`.
 */
export interface AvatarCard {
  title?: string;
  detail?: string;
  targetUrl?: string;
  thumbnailUrl?: string;
}

/** The host part of a URL, for a label that does not wrap over three lines. */
function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Turn bare URLs in a status line into real links.
 *
 * The status API is a string, so a rich result card cannot be drawn here — but a
 * link can at least be made visible and clickable instead of being one more run
 * of text that gets clipped.
 */
function linkify(text: string): ReactNode[] {
  return text.split(/(https?:\/\/[^\s)"'<>]+)/g).map((part, index) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={`${index}-${part}`}
        href={part}
        target="_blank"
        rel="noreferrer noopener"
        style={{ color: "#c9b6ff", textDecoration: "underline", pointerEvents: "auto" }}
      >
        {part.length > 60 ? `${part.slice(0, 57)}…` : part}
      </a>
    ) : (
      part
    ),
  );
}

export const Avatar = forwardRef<AvatarHandle, AvatarProps>(function Avatar(
  {
    assetBase = "/assets/avatar",
    modelFile = "diggy_U.vrm",
    fps = 30,
    corner = "bottom-left",
    size = 200,
    intro = true,
    card = null,
    onCardAction,
    stretchEveryMs = 45_000,
    controller,
    onCapability,
    onModeChange,
    children,
    compact,
  },
  ref,
): ReactElement | null {
  const ownedController = useMemo(() => new AvatarController(), []);
  const active = controller ?? ownedController;
  const snapshot = useSyncExternalStore(active.subscribe, active.getSnapshot, active.getSnapshot);

  const lastModeRef = useRef<AvatarRenderMode>(snapshot.mode);
  useEffect(() => {
    if (lastModeRef.current === snapshot.mode) return;
    lastModeRef.current = snapshot.mode;
    onModeChange?.(snapshot.mode, snapshot.fallbackReason);
  }, [snapshot.mode, snapshot.fallbackReason, onModeChange]);

  // The entrance is scripted and runs once the character reports ready: the VRM
  // walks in (procedural, `entry`), gives a happy beat, then settles into idle.
  const introRef = useRef(false);
  const timersRef = useRef<number[]>([]);

  const runIntro = useCallback(() => {
    if (introRef.current) return;
    introRef.current = true;
    if (!intro) return;

    const at = (ms: number, run: () => void): void => {
      timersRef.current.push(window.setTimeout(run, ms));
    };

    active.playNow("entry");
    at(WALK_IN_MS, () => active.playNow("happy"));
    at(WALK_IN_MS + GREET_MS, () => active.playNow("idle"));
  }, [active, intro]);

  useEffect(
    () => () => {
      for (const id of timersRef.current) window.clearTimeout(id);
      timersRef.current = [];
    },
    [],
  );

  const handleCapability = useCallback(
    (report: AvatarCapabilityReport) => {
      active.setCapability(report);
      onCapability?.(report);
      runIntro();
    },
    [active, onCapability, runIntro],
  );

  const handleRenderError = useCallback(
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error ?? "unknown error");
      active.status(`Character failed to load: ${message}`);
    },
    [active],
  );

  // Lifecycle: run the entrance once the renderer is ready. The timeout is a
  // safety net for a renderer that never reports capability.
  useEffect(() => {
    if (!intro) return;
    const timer = window.setTimeout(runIntro, 6000);
    return () => window.clearTimeout(timer);
  }, [intro, runIntro]);

  // Idle ambience: stretch every so often, but only while genuinely idle.
  useEffect(() => {
    if (!stretchEveryMs || stretchEveryMs <= 0) return;
    const id = window.setInterval(() => {
      if (active.getSnapshot().state === "idle") active.play("stretch");
    }, stretchEveryMs);
    return () => window.clearInterval(id);
  }, [stretchEveryMs, active]);

  useImperativeHandle(
    ref,
    () => ({
      play: (state) => active.play(state),
      say: (text, mood) => active.say(text, mood),
      lookAt: (target) => active.lookAt(target),
      setExpression: (expression) => active.setExpression(expression),
      status: (text) => active.status(text),
      setVisible: (visible) => active.setVisible(visible),
      controller: active,
      capability: () => active.capability(),
      mode: () => active.mode(),
    }),
    [active],
  );

  if (!snapshot.visible) return null;

  if (compact) {
    return (
      <div
        style={{
          position: "fixed",
          pointerEvents: "auto",
          ...verticalEdge(corner, CORNER_OFFSET),
          ...horizontalEdge(corner, CORNER_OFFSET),
          width: 40,
          height: 40,
          background: "rgba(17, 17, 24, 0.94)",
          borderRadius: 50,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          boxShadow: "0 4px 12px rgba(0,0,0,0.28)",
        }}
        aria-hidden
        data-diggy-avatar-root=""
        onClick={() => window.dispatchEvent(new Event("diggy:toggle"))}
      >
        <span style={{ color: "#e0a63a", fontSize: 24 }}>🤖</span>
      </div>
    );
  }

  const boxHeight = Math.round(size * 1.5);

  return (
    <div
      style={{
        position: "fixed",
        zIndex: 2147483000,
        pointerEvents: "none",
        ...verticalEdge(corner, CORNER_OFFSET),
        ...horizontalEdge(corner, CORNER_OFFSET),
      }}
      aria-hidden
      data-diggy-avatar-root=""
      data-diggy-state={snapshot.state}
      data-diggy-clips={snapshot.capability?.clips.join(",") ?? ""}
    >
      {card ? (
        <div
          data-diggy-avatar-card=""
          style={{
            position: "absolute",
            ...verticalEdge(corner, boxHeight + 8),
            ...horizontalEdge(corner, 0),
            // A thumbnail needs room, so the card is wider than the status line.
            maxWidth: Math.max(300, size * 2.4),
            padding: 12,
            borderRadius: 14,
            background: "rgba(17, 17, 24, 0.94)",
            color: "#f6f4ff",
            font: "12.5px/1.45 system-ui, -apple-system, Segoe UI, sans-serif",
            pointerEvents: "auto",
            boxShadow: "0 10px 28px rgba(0,0,0,0.34)",
            overflowWrap: "anywhere",
          }}
        >
          {card.thumbnailUrl ? (
            <img
              src={card.thumbnailUrl}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              style={{
                display: "block",
                width: "100%",
                aspectRatio: "16 / 9",
                objectFit: "cover",
                borderRadius: 10,
                marginBottom: 9,
                background: "#2a2a35",
              }}
            />
          ) : null}

          {card.title ? (
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{card.title}</div>
          ) : null}
          {card.detail ? <div style={{ opacity: 0.85 }}>{card.detail}</div> : null}
          {card.targetUrl ? (
            <div style={{ opacity: 0.55, fontSize: 11, marginTop: 7 }}>
              {hostOf(card.targetUrl)}
            </div>
          ) : null}

          <div style={{ display: "flex", gap: 8, marginTop: 11 }}>
            {card.targetUrl ? (
              <button
                type="button"
                onClick={() => onCardAction?.("open")}
                style={{
                  flex: "0 0 auto",
                  padding: "6px 14px",
                  borderRadius: 999,
                  border: "none",
                  background: "#7c5cff",
                  color: "#fff",
                  font: "inherit",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Open
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => onCardAction?.("dismiss")}
              style={{
                flex: "0 0 auto",
                padding: "6px 14px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.22)",
                background: "transparent",
                color: "#f6f4ff",
                font: "inherit",
                cursor: "pointer",
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      {snapshot.status && !card ? (
        <div
          data-diggy-avatar-status=""
          style={{
            position: "absolute",
            ...verticalEdge(corner, boxHeight + 8),
            ...horizontalEdge(corner, 0),
            /*
             * Speech-bubble sizing.
             *
             * It used to be `nowrap` with `overflow: hidden`, so every status was
             * a single clipped line and a link could never be read, let alone
             * clicked. It now wraps, is wide enough to be worth reading, and
             * accepts pointer events so a link inside it works.
             */
            maxWidth: Math.max(260, size * 2),
            padding: "9px 13px",
            borderRadius: 14,
            borderBottomLeftRadius: corner === "bottom-left" ? 4 : 14,
            borderBottomRightRadius: corner === "bottom-right" ? 4 : 14,
            background: "rgba(17, 17, 24, 0.9)",
            color: "#f6f4ff",
            font: "12.5px/1.45 system-ui, -apple-system, Segoe UI, sans-serif",
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            pointerEvents: "auto",
            boxShadow: "0 6px 20px rgba(0,0,0,0.28)",
          }}
        >
          💭 {linkify(snapshot.status)}
        </div>
      ) : null}

      <div
        data-diggy-avatar-canvas=""
        style={{ width: size, height: boxHeight, pointerEvents: "auto", position: "relative" }}
      >
        <RendererBoundary>
          <Canvas
            dpr={[1, 2]}
            frameloop="always"
            camera={{ position: [0, CAMERA_TARGET_Y, CAMERA_DISTANCE], fov: 30 }}
            gl={{ alpha: true, antialias: true }}
            style={{ width: "100%", height: "100%", background: "transparent" }}
            onCreated={({ gl }) => gl.setClearAlpha(0)}
          >
            <ambientLight intensity={1.1} />
            <CameraRig />
            <hemisphereLight args={[0xffffff, 0x3a3a3a, 1.2]} />
            <directionalLight position={[2, 4, 3]} intensity={2} />
            <pointLight position={[-2, 2, -2]} intensity={0.7} />
            <FrameDriver onFrame={active.tick} />
            <Suspense fallback={null}>
              <VrmAvatar
                assetBase={assetBase}
                modelFile={modelFile}
                state={snapshot.state}
                lookAt={snapshot.lookAt as AvatarLookAtTarget | null}
                fps={fps}
                onReady={handleCapability}
                onError={handleRenderError}
              />
            </Suspense>
          </Canvas>
        </RendererBoundary>
        {children}
      </div>
    </div>
  );
});

/** Convenience hook: a controller for hosts that want AvatarAPI without `<Avatar>`. */
export function useAvatarController(options?: { autoReturnMs?: number }): AvatarController {
  const ref = useRef<AvatarController | null>(null);
  if (!ref.current) ref.current = new AvatarController(options);
  return ref.current;
}
