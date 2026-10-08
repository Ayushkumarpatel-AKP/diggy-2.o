/**
 * `FbxAvatar` — the primary renderer: Chiori.fbx driven by a three.js
 * `AnimationMixer`, mounted as a React Three Fiber component.
 *
 * Loading is imperative (not `useLoader`) on purpose: a single missing/failed
 * *clip* must not take the whole avatar down. The base model failing is the only
 * fatal case and is reported through `onError` so the host can fall back to VRM.
 */
import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

import type { AvatarCapabilityReport, AvatarExpression, AvatarState } from "@diggy/shared";

import { AVATAR_CLIPS, BASE_MODEL_FILE, clipIds } from "./clips.js";
import { computeFbxFrame } from "./framing.js";
import { STATE_PROFILES, resolveClip } from "./state-machine.js";
import {
  applyExpressionToMeshes,
  blendExpression,
  emptyExpression,
  normalizeExpression,
  presetForState,
} from "./expressions.js";
import { blinkWeight, frameIntervalSeconds } from "./procedural.js";
import { buildCapabilityReport, countTriangles, findBoneName } from "./capability.js";
import type { MeshLike } from "./capability.js";
import type { AvatarLookAtTarget } from "./controller.js";

/** Where the avatar should aim its gaze (alias of the controller's target). */
export type FbxLookAt = AvatarLookAtTarget;

/** An FBX scene group — `FBXLoader` returns a `Group` that carries `animations`. */
type FbxScene = THREE.Group & { animations?: THREE.AnimationClip[] };

export interface FbxAvatarProps {
  /** Base path where `Chiori.fbx`, the clip FBX files and `tex/` live. */
  assetBase?: string;
  /** Active state from the controller (drives clip + expression + layers). */
  state?: AvatarState;
  /** Explicit facial overrides, merged over the state preset. */
  expression?: AvatarExpression | null;
  /** Gaze target. */
  lookAt?: FbxLookAt | null;
  /** Frame-rate cap (the brief asks for ≤30). Defaults to 30. */
  fps?: number;
  /** Called once the base model and every loadable clip have settled. */
  onReady?: (report: AvatarCapabilityReport) => void;
  /** Called only if the base `Chiori.fbx` fails — the caller may fall back to VRM. */
  onError?: (error: unknown) => void;
}

function joinUrl(base: string, file: string): string {
  return `${base.replace(/\/+$/, "")}/${file}`;
}

/** Ported from `app.js` `applyChioriColors`: swap in the shipped textures. */
function applyChioriTextures(root: THREE.Object3D, assetBase: string): void {
  const loader = new THREE.TextureLoader();
  const paths = {
    face: joinUrl(assetBase, "tex/avatar_girl_sword_chiori_mat_face.png"),
    body: joinUrl(assetBase, "tex/avatar_girl_sword_chiori_mat_body.png"),
    hair: joinUrl(assetBase, "tex/avatar_girl_sword_chiori_mat_hair.png"),
  };
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const source = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = source.map((material) => {
      const clone = material.clone() as THREE.MeshStandardMaterial;
      const name = `${clone.name ?? ""} ${mesh.name ?? ""}`.toLowerCase();
      let path = paths.body;
      if (/face|eye|head/.test(name)) path = paths.face;
      else if (/hair|bang/.test(name)) path = paths.hair;
      loader.load(path, (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        clone.map = texture;
        clone.color.set("#ffffff");
        clone.needsUpdate = true;
      });
      clone.needsUpdate = true;
      return clone;
    });
    mesh.material = Array.isArray(mesh.material) ? next : next[0] ?? mesh.material;
  });
}

function disposeObject(root: THREE.Object3D | null): void {
  if (!root) return;
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

const GAZE_EULER = new THREE.Euler(0, 0, 0, "YXZ");
const GAZE_QUAT = new THREE.Quaternion();
const BASE_HEAD = new THREE.Quaternion();

/** A small, bounded head yaw/pitch for the current gaze target. */
function gazeQuaternion(target: FbxLookAt | null, elapsed: number, out: THREE.Quaternion): THREE.Quaternion {
  let yaw = 0;
  let pitch = 0;
  if (target === "cursor" || target === "user" || target === "bubble") {
    yaw = target === "bubble" ? 0.05 : 0.12;
    pitch = Math.sin(elapsed * 1.2) * 0.02;
  } else if (target && typeof target === "object") {
    yaw = Math.max(-0.35, Math.min(0.35, (target.x - 0.5) * 0.4));
    pitch = Math.max(-0.25, Math.min(0.25, (target.y - 0.5) * 0.3));
  }
  GAZE_EULER.set(pitch, yaw, 0);
  return out.setFromEuler(GAZE_EULER);
}

/**
 * The FBX avatar. Renders `null` until the base model is loaded, then mounts it
 * via `<primitive>`. Missing clips are recorded as capability warnings.
 */
export function FbxAvatar({
  assetBase = "/assets/avatar",
  state = "idle",
  expression = null,
  lookAt = null,
  fps = 30,
  onReady,
  onError,
}: FbxAvatarProps): ReactElement | null {
  const [model, setModel] = useState<THREE.Group | null>(null);
  const modelRef = useRef<THREE.Group | null>(null);

  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<Map<string, THREE.AnimationAction>>(new Map());
  const headTrackRef = useRef<Map<string, boolean>>(new Map());
  const activeClipRef = useRef<string | null>(null);
  const morphMeshesRef = useRef<THREE.Mesh[]>([]);
  const currentExpressionRef = useRef<AvatarExpression>(emptyExpression());
  const headRef = useRef<THREE.Object3D | null>(null);
  const restHeadRef = useRef<THREE.Quaternion | null>(null);
  const basePositionRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const elapsedRef = useRef(0);
  const accumulatorRef = useRef(0);

  // Latest props, read from the frame loop without re-subscribing.
  const stateRef = useRef<AvatarState>(state);
  const expressionRef = useRef<AvatarExpression | null>(expression);
  const lookAtRef = useRef<FbxLookAt | null>(lookAt);
  const readyRef = useRef(onReady);
  const errorRef = useRef(onError);
  useEffect(() => {
    stateRef.current = state;
    expressionRef.current = expression;
    lookAtRef.current = lookAt;
    readyRef.current = onReady;
    errorRef.current = onError;
  });

  // --- Base model + clip loading ------------------------------------------
  useEffect(() => {
    let cancelled = false;
    const loader = new FBXLoader();
    actionsRef.current = new Map();
    headTrackRef.current = new Map();
    activeClipRef.current = null;
    mixerRef.current = null;
    modelRef.current = null;

    loader.load(
      joinUrl(assetBase, BASE_MODEL_FILE),
      (fbx) => {
        if (cancelled) {
          disposeObject(fbx);
          return;
        }

        const box = new THREE.Box3().setFromObject(fbx);
        const frame = computeFbxFrame({ min: box.min, max: box.max });
        fbx.scale.setScalar(frame.scale);
        fbx.position.set(frame.position.x, frame.position.y, frame.position.z);
        // The rig is authored facing +Z (the reference rotated it 180° only
        // because its camera sat at -Z). Our corner camera is at +Z, so leaving
        // the model unrotated makes her face the viewer.
        fbx.rotation.y = 0;
        basePositionRef.current.set(frame.position.x, frame.position.y, frame.position.z);
        applyChioriTextures(fbx, assetBase);

        const meshes: THREE.Mesh[] = [];
        const morphMeshes: THREE.Mesh[] = [];
        const boneNames: string[] = [];
        fbx.traverse((object) => {
          const mesh = object as THREE.Mesh;
          if (mesh.isMesh) {
            meshes.push(mesh);
            if (mesh.morphTargetDictionary && mesh.morphTargetInfluences) morphMeshes.push(mesh);
          }
          if ((object as THREE.Bone).isBone) boneNames.push(object.name);
        });
        morphMeshesRef.current = morphMeshes;

        const headName = findBoneName(boneNames, "head");
        const head = headName ? fbx.getObjectByName(headName) : undefined;
        headRef.current = head ?? null;
        restHeadRef.current = head ? head.quaternion.clone() : null;

        const expressions = new Set<string>();
        for (const mesh of morphMeshes) {
          for (const key of Object.keys(mesh.morphTargetDictionary ?? {})) expressions.add(key);
        }

        const mixer = new THREE.AnimationMixer(fbx);
        mixerRef.current = mixer;
        modelRef.current = fbx;
        setModel(fbx);

        const warnings: string[] = [];
        const loadedClips: string[] = [];

        const loadClip = (clip: (typeof AVATAR_CLIPS)[number]): Promise<void> =>
          new Promise((resolve) => {
            loader.load(
              joinUrl(assetBase, clip.file),
              (clipFbx) => {
                const animation = (clipFbx as FbxScene).animations?.[0];
                if (cancelled) {
                  disposeObject(clipFbx);
                  resolve();
                  return;
                }
                if (!animation) {
                  warnings.push(`Clip "${clip.file}" contains no animation.`);
                  disposeObject(clipFbx);
                  resolve();
                  return;
                }
                const action = mixer.clipAction(animation);
                if (clip.loop) {
                  action.setLoop(THREE.LoopRepeat, Infinity);
                } else {
                  action.setLoop(THREE.LoopOnce, 1);
                  action.clampWhenFinished = true;
                }
                actionsRef.current.set(clip.id, action);
                headTrackRef.current.set(
                  clip.id,
                  animation.tracks.some((track) => /head/i.test(track.name)),
                );
                loadedClips.push(clip.id);
                disposeObject(clipFbx);
                resolve();
              },
              undefined,
              (error) => {
                warnings.push(`Clip "${clip.file}" failed to load.`);
                errorRef.current?.(error);
                resolve();
              },
            );
          });

        void Promise.all(AVATAR_CLIPS.map(loadClip)).then(() => {
          if (cancelled) return;
          const report = buildCapabilityReport(
            {
              source: "fbx",
              bones: boneNames,
              expressions: [...expressions],
              clips: loadedClips,
              triangles: countTriangles(meshes as unknown as MeshLike[]),
            },
            { requiredClips: clipIds() },
          );
          report.warnings.push(...warnings);
          readyRef.current?.(report);
        });
      },
      undefined,
      (error) => {
        if (cancelled) return;
        errorRef.current?.(error);
      },
    );

    return () => {
      cancelled = true;
      for (const action of actionsRef.current.values()) action.stop();
      mixerRef.current?.stopAllAction();
      mixerRef.current = null;
      actionsRef.current = new Map();
      headTrackRef.current = new Map();
      activeClipRef.current = null;
      morphMeshesRef.current = [];
      headRef.current = null;
      const mounted = modelRef.current;
      modelRef.current = null;
      setModel(null);
      disposeObject(mounted);
    };
  }, [assetBase]);

  // --- React to state changes (cross-fade clips) ---------------------------
  useEffect(() => {
    if (!model || !mixerRef.current) return;
    const clipId = resolveClip(state, [...actionsRef.current.keys()]);
    const crossFade = STATE_PROFILES[state].crossFade;

    if (!clipId) {
      // Nothing to play (no clips loaded): gracefully idle procedurally.
      for (const action of actionsRef.current.values()) action.fadeOut(crossFade);
      activeClipRef.current = null;
      return;
    }
    if (activeClipRef.current === clipId) return;

    const next = actionsRef.current.get(clipId);
    if (!next) return;
    const previous = activeClipRef.current ? actionsRef.current.get(activeClipRef.current) : undefined;

    next.reset();
    next.enabled = true;
    next.setEffectiveTimeScale(1);
    next.setEffectiveWeight(1);
    next.fadeIn(crossFade);
    next.play();
    if (previous && previous !== next) previous.fadeOut(crossFade);
    activeClipRef.current = clipId;
  }, [state, model]);

  // --- Per-frame: mixer, expressions, procedural layers, gaze --------------
  useFrame((_, delta) => {
    if (!model) return;
    if (typeof document !== "undefined" && document.hidden) return;

    const interval = frameIntervalSeconds(fps);
    accumulatorRef.current += delta;
    if (accumulatorRef.current < interval) return;
    const step = Math.min(accumulatorRef.current, 0.1);
    accumulatorRef.current = 0;
    elapsedRef.current += step;

    mixerRef.current?.update(step);

    const currentState = stateRef.current;
    const profile = STATE_PROFILES[currentState];

    // Facial expression = state preset (or explicit override) + procedural blink.
    const preset = expressionRef.current ?? presetForState(currentState);
    let target = normalizeExpression(preset);
    if (profile.procedural.includes("blink")) {
      target = { ...target, Blink: Math.max(target.Blink ?? 0, blinkWeight(elapsedRef.current)) };
    }
    currentExpressionRef.current = blendExpression(currentExpressionRef.current, target, 0.12);
    applyExpressionToMeshes(morphMeshesRef.current, currentExpressionRef.current);

    // Procedural breath: a subtle root bob that never fights the mixer.
    const base = basePositionRef.current;
    if (profile.procedural.includes("breath")) {
      const amount = currentState === "sleep" ? 0.4 : 1;
      model.position.y = base.y + Math.sin(elapsedRef.current * Math.PI * 2 * 0.22) * 0.006 * amount;
    } else {
      model.position.y = base.y;
    }

    // Gaze: a small head yaw layered on top of the clip, only when the active
    // clip actually animates the head (or when no clip is playing) so the offset
    // can never accumulate frame over frame.
    const head = headRef.current;
    const rest = restHeadRef.current;
    const activeClip = activeClipRef.current;
    if (head && rest) {
      const animatesHead = activeClip ? headTrackRef.current.get(activeClip) === true : false;
      if (!activeClip) {
        BASE_HEAD.copy(rest);
      } else if (animatesHead) {
        BASE_HEAD.copy(head.quaternion);
      } else {
        BASE_HEAD.copy(rest);
      }
      head.quaternion.copy(BASE_HEAD).multiply(gazeQuaternion(lookAtRef.current, elapsedRef.current, GAZE_QUAT));
    }
  });

  if (!model) return null;
  return <primitive object={model} dispose={null} />;
}
