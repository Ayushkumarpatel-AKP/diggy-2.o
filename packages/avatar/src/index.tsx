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
  /** External controller to drive; one is created internally otherwise. */
  controller?: AvatarController;
  /** Called once a renderer reports its capability. */
  onCapability?: (report: AvatarCapabilityReport) => void;
  /** Called when the renderer mode changes (e.g. FBX → VRM fallback). */
  onModeChange?: (mode: AvatarRenderMode, reason: string | null) => void;
  /** Extra content rendered inside the avatar box (host overlays). */
  children?: ReactNode;
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
export const Avatar = forwardRef<AvatarHandle, AvatarProps>(function Avatar(
  {
    assetBase = "/assets/avatar",
    modelFile = "diggy_U.vrm",
    fps = 30,
    corner = "bottom-left",
    size = 200,
    intro = true,
    stretchEveryMs = 45_000,
    controller,
    onCapability,
    onModeChange,
    children,
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
      {snapshot.status ? (
        <div
          data-diggy-avatar-status=""
          style={{
            position: "absolute",
            ...verticalEdge(corner, boxHeight + 6),
            ...horizontalEdge(corner, 0),
            maxWidth: size * 1.4,
            padding: "4px 10px",
            borderRadius: 12,
            background: "rgba(17, 17, 24, 0.82)",
            color: "#f6f4ff",
            font: "12px/1.35 system-ui, -apple-system, Segoe UI, sans-serif",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            pointerEvents: "none",
          }}
        >
          💭 {snapshot.status}
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
