# Worker brief — voice

Read `agents/ORCHESTRATION_BRIEF.md` first.

## Goal

Push-to-talk voice: **CTRL+SPACE** → avatar listens → speech-to-text → AI processing (thinking bubble)
→ response → avatar speaks. Never show a blank loading state.

## Owns (only edit these)

`apps/extension/entrypoints/offscreen/**`, `apps/extension/src/shortcut.ts`, `packages/voice/**`.

## Deliverables

1. `shortcut.ts`: global **CTRL+SPACE** push-to-talk (hold to talk, release to stop) via the MV3
   `commands` API + an offscreen document for the mic. Mic is live only while held, with a visible indicator;
   audio is not stored by default.
2. `offscreen/`: `MediaRecorder` capture → send to the brain's STT (`Provider.transcribe`, Groq
   `whisper-large-v3`). Reuse the proven sequence from
   `C:\Users\Ayush\orca\projects\diggy\apps\extension\entrypoints\offscreen`.
3. `packages/voice`: STT/TTS wrappers + an audio analyser feed for lip-sync (`aa/ih/ou/ee/oh`), smoothed.
4. Thinking/status messages above the avatar for every phase: "💭 Reading page…", "💭 Looking for
   updates…", "💭 Monitoring website…", "💭 Filling form…", "💭 Analyzing repository…", "💭 Searching web…".
   Route through `AvatarAPI.status` / `BusEvents.AvatarStatus`.
5. TTS playback + lip-sync wiring (`AvatarAPI.say`).

## Constraints / do-not-touch

- Edit only the paths above.
- Mic permission is requested from an extension page, not a content script.
- Voice is opt-in; never autoplay sound; no audio persisted by default.
- No provider keys in the extension — STT/TTS call through the brain/provider layer.

## Observable acceptance

- Tests: shortcut maps to press/release; the offscreen recorder starts and stops; a transcript event
  reaches the bus.
- `pnpm -w typecheck` + `pnpm -w build` green.
- Manual: hold CTRL+SPACE → speak → transcript appears → thinking bubble shows → reply is spoken.

## Report

Files changed, exact test command + result, and the manual round-trip result.
