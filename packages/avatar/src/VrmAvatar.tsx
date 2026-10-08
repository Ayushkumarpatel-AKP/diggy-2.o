/**
 * `VrmAvatar` — the graceful fallback renderer.
 *
 * Used only when the primary FBX assets fail to load. It renders the shipped
 * `AvatarSample_I.vrm` with `@pixiv/three-vrm`, reusing the same state machine,
 * expression presets and capability report shape as the FBX path (source `vrm`).
 *
 * The VRM object is duck-typed locally ({@link VrmLike}) rather than importing
 * three-vrm's transitive types: those d.ts files use extensionless cross-package
 * re-exports that TypeScript's `NodeNext` resolver cannot follow. Only the
 * runtime `VRMLoaderPlugin` value is imported from the package.
 *
 * Because it uses `useLoader`, it suspends; the host wraps it in `<Suspense>` and
 * an error boundary so a failed VRM load simply leaves the avatar hidden rather
 * than crashing the page.
 */
import { useEffect, useRef } from "react";
import type { ReactElement } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin } from "@pixiv/three-vrm";

import type { AvatarCapabilityReport, AvatarExpression, AvatarState } from "@diggy/shared";

import { computeFbxFrame } from "./framing.js";
import { STATE_PROFILES } from "./state-machine.js";
import { EXPRESSION_FOR_STATE } from "./expressions.js";
import type { ExpressionPresetName } from "./expressions.js";
import { blinkWeight, frameIntervalSeconds } from "./procedural.js";
import { buildCapabilityReport, countTriangles } from "./capability.js";
import type { MeshLike } from "./capability.js";
import type { FbxLookAt } from "./FbxAvatar.js";

/** The slice of a three-vrm `VRM` this fallback touches (duck-typed on purpose). */
interface VrmLike {
  scene: THREE.Object3D;
  humanoid?: { humanBones?: Record<string, unknown> } | null;
  expressionManager?: {
    expressionMap?: Record<string, unknown>;
    getValue(name: string): number | undefined;
    setValue(name: string, value: number): void;
  } | null;
  lookAt?: { autoUpdate: boolean; target?: THREE.Object3D | null } | null;
  update(delta: number): void;
}

/** VRM emotion presets this fallback blends. */
const MANAGED_VRM_EXPRESSIONS: readonly string[] = [
  "happy",
  "angry",
  "sad",
  "relaxed",
  "surprised",
  "neutral",
];

/** Map an FBX expression preset onto the closest VRM emotion preset. */
const VRM_PRESET_FOR: Record<ExpressionPresetName, string> = {
  happy: "happy",
  excited: "happy",
  surprised: "surprised",
  angry: "angry",
  sad: "sad",
  wink: "happy",
  kiss: "happy",
  confused: "relaxed",
  smug: "relaxed",
  sleepy: "relaxed",
};

export interface VrmAvatarProps {
  /** URL of the `.vrm` model. */
  url: string;
  /** Active state from the controller. */
  state?: AvatarState;
  /** Explicit facial overrides (the VRM path ignores the raw morph map). */
  expression?: AvatarExpression | null;
  /** Gaze target. */
  lookAt?: FbxLookAt | null;
  /** Frame-rate cap. Defaults to 30. */
  fps?: number;
  /** Called once the VRM is ready, with its capability report. */
  onReady?: (report: AvatarCapabilityReport) => void;
}

function vrmPresetForState(state: AvatarState): string {
  const preset = EXPRESSION_FOR_STATE[state];
  return preset ? VRM_PRESET_FOR[preset] : "neutral";
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const material = mesh.material;
    const list = Array.isArray(material) ? material : material ? [material] : [];
    for (const item of list) {
      for (const value of Object.values(item as unknown as Record<string, unknown>)) {
        const texture = value as { isTexture?: boolean; dispose?: () => void } | null;
        if (texture && texture.isTexture) texture.dispose?.();
      }
      item.dispose();
    }
  });
}

/**
 * The VRM fallback avatar. Suspends while the model loads.
 */
export function VrmAvatar({
  url,
  state = "idle",
  expression = null,
  lookAt = null,
  fps = 30,
  onReady,
}: VrmAvatarProps): ReactElement {
  const gltf = useLoader(GLTFLoader, url, (loader) => {
    loader.register((parser) => new VRMLoaderPlugin(parser) as never);
  });

  const vrmRef = useRef<VrmLike | null>(null);
  const lookTargetRef = useRef<THREE.Object3D | null>(null);
  const baseYRef = useRef(0);
  const elapsedRef = useRef(0);
  const accumulatorRef = useRef(0);

  const stateRef = useRef<AvatarState>(state);
  const lookAtRef = useRef<FbxLookAt | null>(lookAt);
  const readyRef = useRef(onReady);
  useEffect(() => {
    stateRef.current = state;
    lookAtRef.current = lookAt;
    readyRef.current = onReady;
  });

  useEffect(() => {
    const vrm = (gltf.userData as { vrm?: VrmLike }).vrm;
    if (!vrm) return;
    vrmRef.current = vrm;

    vrm.scene.traverse((object: THREE.Object3D) => {
      object.frustumCulled = false;
    });

    // Frame it like the FBX path so both renderers occupy the same screen space.
    const box = new THREE.Box3().setFromObject(vrm.scene);
    const frame = computeFbxFrame({ min: box.min, max: box.max });
    vrm.scene.scale.setScalar(frame.scale);
    vrm.scene.position.set(frame.position.x, frame.position.y, frame.position.z);
    baseYRef.current = frame.position.y;

    if (vrm.lookAt) {
      vrm.lookAt.autoUpdate = true;
      const target = new THREE.Object3D();
      target.position.set(0, 1.3, 1.4);
      lookTargetRef.current = target;
      vrm.lookAt.target = target;
    }

    const meshes: THREE.Mesh[] = [];
    vrm.scene.traverse((object: THREE.Object3D) => {
      if ((object as THREE.Mesh).isMesh) meshes.push(object as THREE.Mesh);
    });

    const bones = Object.keys(vrm.humanoid?.humanBones ?? {});
    const expressions = Object.keys(vrm.expressionManager?.expressionMap ?? {});

    readyRef.current?.(
      buildCapabilityReport({
        source: "vrm",
        bones,
        expressions,
        clips: [],
        triangles: countTriangles(meshes as unknown as MeshLike[]),
      }),
    );

    return () => {
      vrmRef.current = null;
      try {
        disposeObject(vrm.scene);
      } catch {
        /* best-effort */
      }
    };
  }, [gltf]);

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

    const currentState = stateRef.current;
    const manager = vrm.expressionManager;
    if (manager) {
      const target = expression ? undefined : vrmPresetForState(currentState);
      for (const name of MANAGED_VRM_EXPRESSIONS) {
        const current = manager.getValue(name) ?? 0;
        const goal = !expression && name === target ? 1 : 0;
        manager.setValue(name, THREE.MathUtils.damp(current, goal, 8, step));
      }
      if (!expression && STATE_PROFILES[currentState].procedural.includes("blink")) {
        manager.setValue("blink", Math.max(manager.getValue("blink") ?? 0, blinkWeight(elapsedRef.current)));
      }
    }

    // Procedural breath as a subtle root bob (never fights the clips/springbones).
    if (STATE_PROFILES[currentState].procedural.includes("breath")) {
      const amount = currentState === "sleep" ? 0.4 : 1;
      vrm.scene.position.y = baseYRef.current + Math.sin(elapsedRef.current * Math.PI * 2 * 0.22) * 0.006 * amount;
    } else {
      vrm.scene.position.y = baseYRef.current;
    }

    const lookTarget = lookTargetRef.current;
    if (lookTarget && lookAtRef.current && typeof lookAtRef.current === "object") {
      lookTarget.position.set((lookAtRef.current.x - 0.5) * 2, 1.3, 1.4);
    }

    vrm.update(step);
  });

  return <primitive object={gltf.scene} dispose={null} />;
}
