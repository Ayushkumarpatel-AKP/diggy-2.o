# Worker brief — avatar

Read `agents/ORCHESTRATION_BRIEF.md` first.

## Goal

A living FBX avatar that renders bottom-right of every page, driven by a 12-state machine, with a
graceful VRM fallback. Implement `AvatarAPI` from `packages/shared/src/contracts/avatar.ts`.

## Owns (only edit these)

`packages/avatar/**`, `assets/avatar/**`.

## Assets (do not replace, do not regenerate)

`diggy motion/Chiori.fbx` + clips: `Standing Idle.fbx`, `Walking.fbx`, `Happy Walk.fbx`,
`Clapping.fbx`, `Angry Point.fbx`, `Arm Stretching.fbx`, `Looking.fbx`, `Standing Greeting.fbx`;
textures in `diggy motion/tex/*`. Copy them into `assets/avatar/` (do NOT rename). The reference
implementation is `diggy motion/app.js` — reuse its `expressionPresets`, `motionExpressionProfiles`,
and `AnimationMixer` wiring.

## Deliverables

1. `FbxAvatar.tsx` (React Three Fiber): `FBXLoader` + `THREE.AnimationMixer`. Load `Chiori.fbx` and
   all 9 clips; frame/scale like `frameFbx()` in `app.js`.
2. `state-machine.ts`: map the 12 `AvatarState`s to clips + procedural layers:
   idle→Standing Idle, walk→Walking, happy→Happy Walk, celebration→Clapping, warning→Angry Point,
   listening/speaking→Standing Greeting/Looking, thinking→Looking, plus procedural blink/breath.
   Crossfade 0.2–0.35s. Lower priority never interrupts higher; always return to idle.
3. `expressions.ts`: port the FBX morph-target expression presets from `app.js`
   (`happy/surprised/angry/wink/sad/kiss/confused/smug/sleepy/excited`).
4. `capability.ts`: emit `AvatarCapabilityReport` (bones, expressions, clips, triangles, warnings).
5. VRM fallback: if FBX assets fail to load, fall back to `@pixiv/three-vrm` + the existing
   `AvatarSample_I.vrm` (port from `C:\Users\Ayush\orca\projects\diggy\packages\avatar`).
6. `index.tsx`: mount the avatar bottom-right, `pointer-events` only on the avatar, never block content.
   Wire `status()` to render the 💭 status line above the head.

## Constraints / do-not-touch

- Edit only `packages/avatar/**` and `assets/avatar/**`.
- Do NOT use VRM as the primary path; FBX is primary.
- Loading must never crash the page; degrade with warnings. Performance: ≤30k tris target, 30 FPS cap,
  pause when the tab is hidden.

## Observable acceptance

- A test proves the state machine maps all 12 states and that a missing bone/clip degrades without throwing.
- `pnpm -w typecheck` + `pnpm -w build` green.
- Manual: the avatar renders bottom-right on a real page and reacts to a `play("thinking")` call.

## Report

Files changed, exact commands + results, capability report for `Chiori.fbx`, and any missing bone/clip.
