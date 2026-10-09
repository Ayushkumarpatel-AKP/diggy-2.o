/**
 * `VrmAvatar` — DIGGY's character renderer.
 *
 * Loads `diggy_U.vrm` with `@pixiv/three-vrm` and every bundled `.vrma` clip from
 * `assets/avatar/animations/` (see `animations.ts` for the catalogue and
 * `ANIMATIONS.md` for the human-readable reference).
 *
 * Two things are procedural rather than clips, because no `.vrma` ships for them:
 * the **entrance walk-in** (`entry`) and the idle layers (breathing, blinking).
 *
 * Loading is imperative on purpose: one unreadable clip must not take the whole
 * character down — it is recorded as a capability warning instead.
 *
 * three-vrm's transitive `.d.ts` files use extensionless cross-package re-exports
 * that TypeScript's `NodeNext` resolver cannot follow, so the VRM object is
 * duck-typed locally and only runtime values are imported from the package.
 */
import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin } from "@pixiv/three-vrm";
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from "@pixiv/three-vrm-animation";

import type { AvatarCapabilityReport, AvatarState } from "@diggy/shared";

import { ANIMATION_DIR, AVATAR_ANIMATIONS, animationForState } from "./animations.js";
import { computeFbxFrame } from "./framing.js";
import { STATE_PROFILES } from "./state-machine.js";
import { blinkWeight, frameIntervalSeconds } from "./procedural.js";
import { buildCapabilityReport, countTriangles } from "./capability.js";
import type { MeshLike } from "./capability.js";

/** The slice of a three-vrm `VRM` this renderer touches (duck-typed on purpose). */
interface VrmLike {
  scene: THREE.Object3D;
  humanoid?: {
    humanBones?: Record<string, unknown>;
    getNormalizedBoneNode(name: string): THREE.Object3D | null;
    resetNormalizedPose(): void;
  } | null;
  expressionManager?: {
    expressionMap?: Record<string, unknown>;
    getValue(name: string): number | undefined;
    setValue(name: string, value: number): void;
    resetValues(): void;
  } | null;
  lookAt?: { autoUpdate: boolean; target?: THREE.Object3D | null } | null;
  update(delta: number): void;
}

/** VRM emotion presets this renderer blends. */
const MANAGED_EXPRESSIONS = ["happy", "angry", "sad", "relaxed", "surprised", "neutral"] as const;

/** Gaze target in our box. */
export type VrmLookAt = "cursor" | "user" | "bubble" | { x: number; y: number } | null;

export interface VrmAvatarProps {
  /** Base URL where the model + `animations/` live. */
  assetBase?: string;
  /** File name of the VRM model. */
  modelFile?: string;
  /** Active state from the controller. */
  state?: AvatarState;
  /** Gaze target. */
  lookAt?: VrmLookAt;
  /** Frame-rate cap (brief: ≤30). Defaults to 30. */
  fps?: number;
  /** Called once the model and its clips have settled. */
  onReady?: (report: AvatarCapabilityReport) => void;
  /** Called only when the model itself fails to load. */
  onError?: (error: unknown) => void;
}

/* --- entrance walk-in (procedural; no .vrma ships for it) ----------------- */

/** Where the walk-in starts, in the framed model's units. */
const WALK_FROM_X = -1.7;
const WALK_FROM_Z = 0.5;
/** Seconds the entrance takes. */
export const WALK_IN_SECONDS = 4.2;

interface WalkState {
  elapsed: number;
  base: Map<string, THREE.Quaternion>;
  /** The framed rest position — the walk starts away from it and returns to it. */
  home: THREE.Vector3;
}

const WALK_BONES = [
  "leftUpperLeg",
  "rightUpperLeg",
  "leftLowerLeg",
  "rightLowerLeg",
  "leftFoot",
  "rightFoot",
  "leftShoulder",
  "rightShoulder",
  "leftUpperArm",
  "rightUpperArm",
  "leftLowerArm",
  "rightLowerArm",
  "leftHand",
  "rightHand",
  "hips",
  "spine",
  "chest",
  "neck",
  "head",
];

function bone(vrm: VrmLike, name: string): THREE.Object3D | null {
  return vrm.humanoid?.getNormalizedBoneNode(name) ?? null;
}

function beginWalk(vrm: VrmLike, home: THREE.Vector3): WalkState {
  vrm.scene.position.set(home.x + WALK_FROM_X, home.y, home.z + WALK_FROM_Z);
  // The model faces +Z at rest; start side-on so the camera sees a profile first.
  vrm.scene.rotation.y = Math.PI / 2;
  const base = new Map<string, THREE.Quaternion>();
  for (const name of WALK_BONES) {
    const node = bone(vrm, name);
    if (node) base.set(name, node.quaternion.clone());
  }
  return { elapsed: 0, base, home: home.clone() };
}

/** Apply an additive rotation offset on top of the clip's pose. */
function offset(
  vrm: VrmLike,
  walk: WalkState,
  name: string,
  x: number,
  y: number,
  z: number,
  fade: number,
): void {
  const node = bone(vrm, name);
  const base = walk.base.get(name);
  if (!node || !base) return;
  const euler = new THREE.Euler().setFromQuaternion(base);
  node.rotation.set(
    euler.x + x * fade,
    euler.y + y * fade,
    euler.z + z * fade,
  );
}

function updateWalk(vrm: VrmLike, walk: WalkState, delta: number): boolean {
  walk.elapsed += Math.min(delta, 0.05);
  const progress = THREE.MathUtils.clamp(walk.elapsed / WALK_IN_SECONDS, 0, 1);

  // Curve inward, settle, then turn to face the viewer.
  const lateral = THREE.MathUtils.smoothstep(progress, 0, 0.55);
  const approach = THREE.MathUtils.smoothstep(progress, 0.3, 0.7);
  const turn = THREE.MathUtils.smoothstep(progress, 0.76, 0.98);
  vrm.scene.position.x = walk.home.x + THREE.MathUtils.lerp(WALK_FROM_X, 0, lateral) * (1 - approach);
  vrm.scene.position.z = walk.home.z + THREE.MathUtils.lerp(WALK_FROM_Z, 0, approach);
  vrm.scene.position.y = walk.home.y;
  vrm.scene.rotation.y = THREE.MathUtils.lerp(Math.PI / 2, 0, turn);

  const gait = walk.elapsed * 7.4;
  const step = Math.sin(gait);
  const opposite = Math.sin(gait + Math.PI);
  const leftKnee = Math.pow(Math.max(0, step), 1.35);
  const rightKnee = Math.pow(Math.max(0, opposite), 1.35);
  const stride = 1 - THREE.MathUtils.smoothstep(progress, 0.56, 0.72);

  offset(vrm, walk, "leftUpperLeg", opposite * 0.34, step * 0.025, 0, stride);
  offset(vrm, walk, "rightUpperLeg", step * 0.34, opposite * 0.025, 0, stride);
  offset(vrm, walk, "leftLowerLeg", leftKnee * 0.38, 0, 0, stride);
  offset(vrm, walk, "rightLowerLeg", rightKnee * 0.38, 0, 0, stride);
  offset(vrm, walk, "leftFoot", -leftKnee * 0.22 + step * 0.04, 0, 0, stride);
  offset(vrm, walk, "rightFoot", -rightKnee * 0.22 + opposite * 0.04, 0, 0, stride);
  offset(vrm, walk, "leftUpperArm", step * 0.24, 0, -1.35 + step * 0.06, stride);
  offset(vrm, walk, "rightUpperArm", opposite * 0.24, 0, 1.35 + opposite * 0.06, stride);
  offset(vrm, walk, "leftLowerArm", leftKnee * 0.12, 0, step * 0.025, stride);
  offset(vrm, walk, "rightLowerArm", rightKnee * 0.12, 0, opposite * 0.025, stride);
  offset(vrm, walk, "hips", Math.abs(step) * 0.018, step * 0.02, step * 0.022, stride);
  offset(vrm, walk, "spine", 0, -step * 0.006, -step * 0.012, stride);
  offset(vrm, walk, "chest", 0, step * 0.012, -step * 0.01, stride);
  offset(vrm, walk, "neck", 0, -step * 0.008, step * 0.005, stride);
  offset(vrm, walk, "head", 0, -step * 0.005, step * 0.003, stride);

  if (progress >= 1) {
    vrm.scene.position.copy(walk.home);
    return true;
  }
  return false;
}

/* --- procedural idle (the reference viewer's natural stance) -------------- */

/**
 * States the renderer drives by hand instead of playing a clip — this matches the
 * reference `vrm-viewer`, whose Idle is an explicit arms-down pose plus breathing
 * and blinking (there is no "idle" `.vrma`; `Relax.vrma` is a stretch).
 */
const PROCEDURAL_STATES: ReadonlySet<AvatarState> = new Set<AvatarState>([
  "idle",
  "blink",
  "breathing",
]);

/** Natural standing pose, in degrees (ported from the viewer's `idlePose`). */
const IDLE_POSE: Readonly<Record<string, readonly [number, number, number]>> = {
  leftUpperArm: [-8, -16, -67],
  rightUpperArm: [-14, 5, 66],
  rightLowerArm: [-5, 0, 5],
  rightHand: [-1, -1, -4],
};

const DEG = Math.PI / 180;

function applyIdlePose(vrm: VrmLike): void {
  for (const [name, angles] of Object.entries(IDLE_POSE)) {
    const node = bone(vrm, name);
    if (node) node.rotation.set(angles[0] * DEG, angles[1] * DEG, angles[2] * DEG);
  }
}

/* --- component ------------------------------------------------------------ */

export function VrmAvatar({
  assetBase = "/assets/avatar",
  modelFile = "diggy_U.vrm",
  state = "idle",
  lookAt = null,
  fps = 30,
  onReady,
  onError,
}: VrmAvatarProps): ReactElement | null {
  const [model, setModel] = useState<THREE.Object3D | null>(null);

  const vrmRef = useRef<VrmLike | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<Map<string, THREE.AnimationAction>>(new Map());
  const activeRef = useRef<string | null>(null);
  const walkRef = useRef<WalkState | null>(null);
  const baseYRef = useRef(0);
  /** The framed rest position (the walk-in departs from and returns to it). */
  const homeRef = useRef(new THREE.Vector3());
  const elapsedRef = useRef(0);
  const accumulatorRef = useRef(0);
  const lookTargetRef = useRef<THREE.Object3D | null>(null);
  const warningsRef = useRef<string[]>([]);

  const stateRef = useRef<AvatarState>(state);
  const lookAtRef = useRef<VrmLookAt>(lookAt);
  const readyRef = useRef(onReady);
  const errorRef = useRef(onError);
  useEffect(() => {
    stateRef.current = state;
    lookAtRef.current = lookAt;
    readyRef.current = onReady;
    errorRef.current = onError;
  });

  // --- load the model, then every clip ------------------------------------
  useEffect(() => {
    let cancelled = false;
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser) as never);
    loader.register((parser) => new VRMAnimationLoaderPlugin(parser) as never);

    const base = assetBase.replace(/\/+$/, "");

    const loadClip = (id: string, file: string): Promise<void> =>
      new Promise((resolve) => {
        loader.load(
          `${base}/${ANIMATION_DIR}/${file}`,
          (gltf) => {
            const data = (gltf.userData as { vrmAnimations?: unknown[] }).vrmAnimations?.[0];
            const vrm = vrmRef.current;
            if (cancelled || !data || !vrm) {
              warningsRef.current.push(`Clip "${file}" could not be applied.`);
              resolve();
              return;
            }
            try {
              const clip = createVRMAnimationClip(data as never, vrm as never) as THREE.AnimationClip;
              const action = mixerRef.current!.clipAction(clip);
              if (AVATAR_ANIMATIONS.find((a) => a.id === id)?.loop) {
                action.setLoop(THREE.LoopRepeat, Infinity);
              } else {
                action.setLoop(THREE.LoopOnce, 1);
                action.clampWhenFinished = true;
              }
              actionsRef.current.set(id, action);
            } catch (error) {
              warningsRef.current.push(`Clip "${file}" failed: ${String(error)}`);
            }
            resolve();
          },
          undefined,
          () => {
            warningsRef.current.push(`Clip "${file}" did not load.`);
            resolve();
          },
        );
      });

    loader.load(
      `${base}/${modelFile}`,
      (gltf) => {
        if (cancelled) return;
        const vrm = (gltf.userData as { vrm?: VrmLike }).vrm;
        if (!vrm) {
          errorRef.current?.(new Error("not a VRM file"));
          return;
        }

        vrmRef.current = vrm;
        vrm.scene.traverse((object) => {
          object.frustumCulled = false;
        });

        // Frame it in the corner box (feet on the origin, ~2.15 units tall).
        const box = new THREE.Box3().setFromObject(vrm.scene);
        const frame = computeFbxFrame({ min: box.min, max: box.max });
        vrm.scene.scale.setScalar(frame.scale);
        vrm.scene.position.set(frame.position.x, frame.position.y, frame.position.z);
        baseYRef.current = frame.position.y;
        homeRef.current.copy(vrm.scene.position);
        vrm.scene.rotation.y = 0; // Diggy faces +Z, i.e. the corner camera

        if (vrm.lookAt) {
          vrm.lookAt.autoUpdate = true;
          const target = new THREE.Object3D();
          target.position.set(0, 1.3, 1.4);
          lookTargetRef.current = target;
          vrm.lookAt.target = target;
        }

        mixerRef.current = new THREE.AnimationMixer(vrm.scene);
        actionsRef.current = new Map();

        const meshes: THREE.Mesh[] = [];
        vrm.scene.traverse((object) => {
          if ((object as THREE.Mesh).isMesh) meshes.push(object as THREE.Mesh);
        });

        setModel(vrm.scene);

        void Promise.all(AVATAR_ANIMATIONS.map((a) => loadClip(a.id, a.file))).then(() => {
          if (cancelled) return;
          const report = buildCapabilityReport(
            {
              source: "vrm",
              bones: Object.keys(vrm.humanoid?.humanBones ?? {}),
              expressions: Object.keys(vrm.expressionManager?.expressionMap ?? {}),
              clips: [...actionsRef.current.keys()],
              triangles: countTriangles(meshes as unknown as MeshLike[]),
            },
            { requiredClips: AVATAR_ANIMATIONS.map((a) => a.id) },
          );
          report.warnings.push(...warningsRef.current);
          // Start the entrance as soon as the character is able to play it.
          walkRef.current = beginWalk(vrm, homeRef.current);
          readyRef.current?.(report);
        });
      },
      undefined,
      (error) => {
        if (!cancelled) errorRef.current?.(error);
      },
    );

    return () => {
      cancelled = true;
      for (const action of actionsRef.current.values()) action.stop();
      mixerRef.current?.stopAllAction();
      mixerRef.current = null;
      actionsRef.current = new Map();
      activeRef.current = null;
      walkRef.current = null;
      vrmRef.current = null;
      setModel(null);
    };
  }, [assetBase, modelFile]);

  // --- state → clip (crossfade) -------------------------------------------
  useEffect(() => {
    const vrm = vrmRef.current;
    const mixer = mixerRef.current;
    if (!vrm || !mixer) return;

    // The entrance is procedural; leaving it (or any other state) resumes clips.
    if (state === "entry") {
      if (!walkRef.current) walkRef.current = beginWalk(vrm, homeRef.current);
      for (const action of actionsRef.current.values()) action.fadeOut(0.3);
      activeRef.current = null;
      return;
    }
    if (walkRef.current) {
      // Abandoned mid-walk: snap back to the framed rest pose.
      walkRef.current = null;
      vrm.scene.position.copy(homeRef.current);
      vrm.scene.rotation.y = 0;
    }

    // Idle-family states are procedural: no clip, just the natural stance.
    if (PROCEDURAL_STATES.has(state)) {
      for (const action of actionsRef.current.values()) action.fadeOut(0.3);
      activeRef.current = null;
      return;
    }

    const wanted = animationForState(state);
    const target = wanted && actionsRef.current.has(wanted.id) ? wanted.id : "relax";
    if (activeRef.current === target) return;

    const next = actionsRef.current.get(target);
    if (!next) return;
    const previous = activeRef.current ? actionsRef.current.get(activeRef.current) : undefined;
    const fade = STATE_PROFILES[state].crossFade;

    next.reset();
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.fadeIn(fade);
    next.play();
    if (previous && previous !== next) previous.fadeOut(fade);
    activeRef.current = target;
  }, [state, model]);

  // --- per frame ----------------------------------------------------------
  useFrame((_, delta) => {
    const vrm = vrmRef.current;
    if (!vrm) return;
    if (typeof document !== "undefined" && document.hidden) return;

    const interval = frameIntervalSeconds(fps);
    accumulatorRef.current += delta;
    if (accumulatorRef.current < interval) return;
    const step = Math.min(accumulatorRef.current, 0.1);
    accumulatorRef.current = 0;
    elapsedRef.current += step;

    mixerRef.current?.update(step);

    const walking = walkRef.current;
    if (walking && updateWalk(vrm, walking, step)) walkRef.current = null;

    // No clip running → hold the natural standing pose (written after the mixer,
    // so it always wins while nothing is playing).
    if (!walking && !activeRef.current) applyIdlePose(vrm);

    const currentState = stateRef.current;
    const profile = STATE_PROFILES[currentState];
    const manager = vrm.expressionManager;
    if (manager) {
      const wanted = animationForState(currentState)?.expression;
      for (const name of MANAGED_EXPRESSIONS) {
        if (currentState === "entry") continue;
        const goal = name === wanted ? 0.85 : 0;
        const currentValue = manager.getValue(name) ?? 0;
        manager.setValue(name, THREE.MathUtils.damp(currentValue, goal, 8, step));
      }
      if (profile.procedural.includes("blink")) {
        manager.setValue("blink", Math.max(manager.getValue("blink") ?? 0, blinkWeight(elapsedRef.current)));
      }
    }

    // Gentle breath while standing (never fights a clip or the walk-in).
    if (!walking && profile.procedural.includes("breath")) {
      const amount = currentState === "sleep" ? 0.4 : 1;
      vrm.scene.position.y =
        baseYRef.current + Math.sin(elapsedRef.current * Math.PI * 2 * 0.22) * 0.006 * amount;
    } else if (!walking) {
      vrm.scene.position.y = baseYRef.current;
    }

    const lookTarget = lookTargetRef.current;
    const gaze = lookAtRef.current;
    if (lookTarget && gaze && typeof gaze === "object") {
      lookTarget.position.set((gaze.x - 0.5) * 1.6, 1.3, 1.4);
    }

    vrm.update(step);
  });

  if (!model) return null;
  return <primitive object={model} dispose={null} />;
}
