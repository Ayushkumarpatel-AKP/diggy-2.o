# DIGGY character animations — reference

**Character:** `diggy_U.vrm` (VRM 1.0)
**Clips:** `assets/avatar/animations/*.vrma` (also copied into the extension's
`public/assets/avatar/animations/`)

👉 **To ask for an animation change, name the animation** (e.g. *"Goodbye should also play on
`warning`"*, or *"Relax is too stiff"*). This file and
[`packages/avatar/src/animations.ts`](packages/avatar/src/animations.ts) are the single source of
truth — update them together.

---

## Which animation plays when

| Animation | File | Loops | Plays on state(s) | What it should look like |
|---|---|---|---|---|
| **Relax** | `Relax.vrma` | yes | `stretch` | Arms-up stretch/settle — **not** the idle stance (that is procedural) |
| **LookAround** | `LookAround.vrma` | yes | `listening` | Glancing around while DIGGY listens |
| **Thinking** | `Thinking.vrma` | yes | `thinking` | Hand to chin, working something out |
| **Blush** | `Blush.vrma` | yes | `speaking`, `happy` | Warm and lively — talking + happy moments |
| **Clapping** | `Clapping.vrma` | yes | `success` | Applauding after a task succeeds |
| **Jump** | `Jump.vrma` | no | `celebration` | A celebratory jump (one-shot) |
| **Surprised** | `Surprised.vrma` | no | `warning` | Startled — the alert reaction |
| **Sleepy** | `Sleepy.vrma` | yes | `sleep` | Drowsy after long inactivity |
| **Goodbye** | `Goodbye.vrma` | no | `exit` | Waving goodbye when the companion leaves |
| **Angry** | `Angry.vrma` | no | — *(not wired)* | Cross/irritated — **available, not mapped to any state** |
| **Sad** | `Sad.vrma` | yes | — *(not wired)* | Downcast — **available, not mapped to any state** |

### Procedural (no `.vrma` — implemented in code)

| Behaviour | Where | Notes |
|---|---|---|
| **Idle stance** | `packages/avatar/src/VrmAvatar.tsx` (`IDLE_POSE`) | Arms-down natural standing pose for `idle`/`blink`/`breathing`. There is no "idle" `.vrma` — this is an explicit pose, exactly like the reference viewer's Idle button |
| **Walk-in entrance** | same file (`beginWalk`/`updateWalk`) | Plays on state `entry`: walks in from the side, turns to face the viewer, then idles. ~4.2 s |
| **Breathing** | same file | Subtle root bob while `idle`/`sleep` |
| **Blinking** | `procedural.ts` (`blinkWeight`) | Procedural, no clip |

---

## All avatar states (15)

`idle` · `blink` · `breathing` · `listening` · `thinking` · `speaking` · `walk` · `happy` ·
`success` · `warning` · `sleep` · `celebration` · `entry` · `stretch` · `exit`

- `entry` → the procedural walk-in.
- `walk`, `blink`, `breathing` → procedural; `stretch` currently reuses **Relax**.
- Everything else plays the clip in the table above.

---

## Changing things

**Re-map an animation to a different state** — edit the `states: [...]` array in
`packages/avatar/src/animations.ts` (and this table). No other code changes needed; the renderer
picks it up.

**Wire one of the unused clips** — give `angry` or `sad` a `states: ["…"]` entry.

**Replace a clip's motion** — drop a new `.vrma` with the same file name into
`assets/avatar/animations/` **and** `apps/extension/public/assets/avatar/animations/`, then rebuild
the extension.

**Tune the entrance** — `WALK_IN_SECONDS`, `WALK_FROM_X/Z` and the `offset(...)` calls in
`packages/avatar/src/VrmAvatar.tsx`.

---

## Rebuild after any change

```bash
NODE_ENV=production pnpm --filter @diggy/extension build   # → apps/extension/.output/chrome-mv3
```
