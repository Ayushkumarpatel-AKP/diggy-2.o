# DIGGY — browser automation

How a command becomes a real, verified browser action. This is the "inspect →
plan → act → verify" pipeline; it replaces the earlier behaviour where DIGGY would
open a page and then chain tool calls without ever confirming anything happened.

## The pipeline

```
command ─▶ background.runGoal
             │  1. inspect: pageContext() reads the focused tab's accessibility tree
             │     into the prompt (+ the user's shared vault details)
             ▼
          buildAgent → createAgentRuntime → runBrain (packages/core)
             │  2. plan: the planner produces a short plan
             │  3. act:  the model calls tools; each page action is routed to the
             │           chosen tab and, afterwards, re-inspects it ("Page now:")
             │  4. verify: the tool result carries `verified` (value read back)
             │           and `target` (the element acted on)
             ▼
          result ─▶ spoken reply + run view (panel) + pointer (page)
```

### Inspecting the right tab

- `listTabs` shows every open, readable tab; `useTab` chooses one by description
  (scored against title/host/url, ambiguity reported rather than guessed) or by id.
- Choosing a tab *inspects* it: `useTab` returns that tab's accessibility tree.
- Before a run, `pageContext()` puts the focused tab's accessibility tree into the
  prompt, so the plan is grounded in the real page.

### Acting, and verifying

- The engine (`@diggy/page-agent`) brings an element into view, re-resolves its
  ref (a re-render surfaces as a clear "stale ref" error rather than a wrong
  click), then dispatches a realistic pointer/mouse gesture. `type`/`select` read
  the value back.
- After every action verb the extension takes a fresh snapshot of the target tab
  and appends `Page now: …` to the tool result, so the model always sees the
  consequence. The element handle rides along for the pointer overlay.
- A tool that returns `ok:false` is recorded as a **failed** observation (not a
  silent success), and a repeated failing call stops the run rather than burning
  the step budget.

### Sending

Sending is impossible for the model to do silently. `click` still refuses any
submit/send/delete control. The only model-reachable path is the **`send`** tool,
which:

1. asks the user to approve it every time (never auto) — **by voice**, see below,
2. is refused outright on a sensitive site (bank, payment, password manager,
   health) by `@diggy/policy`,
3. presses the page's Send/Submit control via the user-gesture path, and
4. targets the tab the run was working in.

The panel's own Submit button (`offerSubmit`/`confirmSubmit`) still exists for a
form the user filled.

### Approvals by voice

When DIGGY needs permission it does **not** show an Allow/Not now panel. It
speaks the question through the avatar, opens the microphone, and listens for a
**yes or no** (`apps/extension/src/voice-approval.ts`). Rules that keep this safe:

- Only an explicit yes/no resolves it; an ambiguous reply or a timeout **declines**.
- A deny beats a yes when both appear in one sentence.
- `send`, navigation DIGGY chose itself, and a locked vault field all still ask —
  every time. Nothing is auto-approved.

The old "result card" (Open / Dismiss) is gone: it interrupted any answer that
mentioned a link and read as a "Shall I proceed?" prompt. The answer is spoken and
kept in the chat instead.

### The visible pointer

A Shadow-DOM pointer/highlight that moves to the element a real action touched. It
is driven only by `diggy:pointer` messages the background sends from actual tool
results, so it can never show an action that did not happen. It draws in the same
click-through layer as the avatar and never intercepts the user's input. Visual
only — no `chrome.debugger`, no new permission.

### Task state

The panel shows the real run state (`planning → working → done | couldn't finish |
stopped`, with `waiting for you` during an approval), the plan, each step, and the
conversation. Progress lines no longer overwrite each other.

## Message types (background ↔ panel / content)

| Type | Direction | Purpose |
|---|---|---|
| `diggy:command` | panel → background | a goal, an approval answer, or a local intent |
| `diggy:progress` | background → panel/avatar | the live "thinking" line |
| `diggy:run` | background → panel | the `RunView`: state, plan, steps |
| `diggy:chat` | background → panel | the conversation turns |
| `diggy:confirmation` | background → panel | an approval / submit offer |
| `diggy:card` / `diggy:state` | background → panel | a result card / the shared snapshot |
| `diggy:pointer` | background → content | where an action landed (visual only) |
| `diggy:action` / `diggy:submit` / `diggy:action-catalog` | background → content | drive the Action Engine |

## Honest limits (not verified, so not claimed)

- **No real third-party site is verified.** The browser tests drive the *shipped
  engine* over a local fixture (`e2e/fixtures/pages/chat.html`) — a stand-in for a
  messaging UI — not Instagram or any live site. "Instagram verified" is not a
  claim this repo can make.
- **Synthetic input.** Actions use synthetic DOM events. Sites that ignore them
  (some canvas UIs, a few framework-controlled widgets) may still not respond.
  The `TrustedInputAdapter` seam (`chrome.debugger`) exists but is deliberately
  not implemented — that would add a permission and a "being debugged" banner.
- **Cross-origin iframes, canvas-only UIs, CAPTCHA/OTP** are out of scope and are
  not bypassed.
- **Evals score decisions, not the engine.** `evals/` uses stub tools and golden
  transcripts; it cannot express read-back/pointer/verified. Those are covered by
  the unit tests and the `inspect-act-verify` browser test instead.

## Where the behaviour lives

| Concern | File |
|---|---|
| Act layer, actionability, read-back verify, submit | `packages/page-agent/src/{agent,dom,action-api,user-submit}.ts` |
| Agent loop, failure/no-progress handling, cap | `packages/core/src/{orchestrator,config,memory/compaction}.ts` |
| Inspect/act/verify wrapper, `useTab`, `send` | `apps/extension/src/agent-tools.ts` |
| Target-tab routing + pointer | `apps/extension/src/page-tools.ts` |
| Pointer state | `apps/extension/src/pointer.ts` |
| Pointer overlay + avatar | `apps/extension/entrypoints/content.ts` |
| Run view, approvals, vault context | `apps/extension/entrypoints/background.ts` |
| Panel rendering | `apps/extension/entrypoints/sidepanel/main.tsx` |
| Run-state labels | `packages/ui/src/app/runView.ts` |
