# @diggy/page-agent — the Action Engine

The act layer for the browser agent. It reads a page as an **accessibility tree**
(role + name, not brittle selectors) and performs actions against it — every one
gated by [`@diggy/policy`](../policy), every secret redacted, and it **never
submits**.

Written against the real DOM (content-script first); unit-tested under **jsdom**.
Runtime deps: `@diggy/policy`, `@diggy/shared` (types).

## The Action Engine (`ActionAPI`)

`createActionAPI()` implements the shared contract
(`@diggy/shared`'s `contracts/action.ts`):

```ts
import { createActionAPI } from '@diggy/page-agent';

const engine = createActionAPI();
await engine.snapshot();                 // accessibility tree (text + structured)
await engine.read();                     // page text, fenced as untrusted DATA
await engine.click('Sign in');           // by accessible name, ref or selector
await engine.type('Email', 'a@b.com');   // never echoes the text back
await engine.navigate('https://example.com');
await engine.extract('price');
await engine.fill({ Email: 'a@b.com' }); // never submits
const plan = await engine.plan('summarize this page');   // submit-free plan
await engine.execute(plan, { approve }); // re-checks policy per step
```

Extras on the engine: `tools` (the registry), `a11y()`, `startRecording()` /
`stopRecording()` / `playbook(name)`, `reset()`.

## The act layer (`PageAgent`)

`createPageAgent()` exposes the eight DOM actions directly:
`snapshot`/`click`/`type`/`select`/`pressKey`/`scroll`/`waitFor`/`navigate`/`goBack`.

## Tool registry

`ToolRegistry` is a browser-use-style catalogue: each `RegisteredTool` has a
`name`, a model-readable `description`, its `parameters`, its policy `category`,
and a `run()` returning the shared `ActionResult` (`ok`, `extractedContent`,
`data`, `error`). `describe()` renders the prompt block.

## Plan-before-act

`buildPlan(goal)` returns a plan whose steps each carry a `PolicyVerdict`.
`runPlan(plan, registry)` re-checks every step: `deny` blocks, an irreversible or
`confirm` step needs an explicit approval, and a submit-class step is **refused
even when approved**. No generated plan ever contains a submit/irreversible step.

## Saved playbooks

`PlaybookRecorder` captures successful actions and freezes them into a
reusable, **value-free** workflow: typed text, field values, URLs and queries
become `{{…}}` placeholders, page-specific refs are dropped, and registered vault
values are scrubbed. `replayPlaybook(playbook, run)` replays it.

## Safety

- **Never auto-submit** — a submit/send/delete/purchase control (or `Enter` in a
  form) returns `confirm` and is not touched, even with `{ approved: true }`.
- **Sensitive sites** — navigation/actions on banks, payments, password managers
  and health portals are denied by `decide()`.
- **Page text is data** — `read`/`extract`/`snapshot` taint the session, fence page
  text as DATA and flag injection patterns.
- **Secrets never surface** — password / vault-marked / registered-vault values
  are `[[REDACTED]]` in a snapshot; typed text is never echoed.
- **No CAPTCHA/OTP bypass** — the `TrustedInputAdapter` (`chrome.debugger`) seam is
  a documented stub; `NullInputAdapter` is the safe default.

## Host wiring

`createActionHost()` + `createActionListener()` adapt the engine to a
`runtime.onMessage` boundary (`{ type: 'diggy:action' }`). The extension owns the
one-line registration; see the INTERFACE block in `src/host.ts`.
