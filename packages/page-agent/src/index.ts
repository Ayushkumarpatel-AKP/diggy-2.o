/**
 * `@diggy/page-agent` — the **Action Engine**.
 *
 * The act layer for the browser agent: it turns a live page into an
 * accessibility-tree snapshot and a capped list of interactive elements, then
 * performs `click`/`type`/`select`/`pressKey`/`scroll`/`waitFor`/`navigate`/
 * `goBack` against them. Every action is gated by `@diggy/policy`, every secret
 * is redacted, and the engine **never** submits.
 *
 * ## What it exports
 * - **Act layer** — {@link createPageAgent}, {@link PageAgent}, plus `snapshot`,
 *   `dom`, `controls`, `ref-registry` and the {@link TrustedInputAdapter} seam.
 * - **Accessibility tree** — {@link buildA11ySnapshot}, {@link A11ySnapshot}.
 * - **Action Engine** — {@link createActionAPI}, {@link ActionEngine}
 *   (implements the shared `ActionAPI`): `snapshot`/`read`/`click`/`type`/
 *   `navigate`/`extract`/`fill`/`plan`/`execute`.
 * - **Tools** — {@link ToolRegistry}, browser-use-style `RegisteredTool`s.
 * - **Plan-before-act** — {@link buildPlan}, {@link runPlan}, {@link isSubmitStep}.
 * - **Playbooks** — {@link PlaybookRecorder}, {@link Playbook}, {@link replayPlaybook}.
 * - **Host glue** — {@link createActionHost}, {@link createActionListener}.
 *
 * ## The never-auto-submit rule
 * A click or `Enter` on a submit/send/delete/purchase control is classified as
 * the policy's `submit` tool (irreversible → always `ask`) and is **never**
 * executed: the action returns `ok: false` and the user presses it. No generated
 * plan contains a submit step either (see `plan.ts`).
 *
 * ## Page text is data
 * `read`/`extract`/`snapshot` taint the session and return page text fenced as
 * untrusted DATA; injection patterns are flagged, never obeyed.
 */
export * from './types.js';
export * from './dom.js';
export * from './controls.js';
export * from './input-adapter.js';
export * from './policy-gate.js';
export * from './ref-registry.js';
export * from './snapshot.js';
export * from './agent.js';
export * from './a11y-snapshot.js';
export * from './verdict.js';
export * from './tool-registry.js';
export * from './plan.js';
export * from './playbook.js';
export * from './action-api.js';
export * from './host.js';

import { createActionAPI } from './action-api.js';
import type { ActionEngine } from './action-api.js';

let defaultEngine: ActionEngine | null = null;

/**
 * The process-wide Action Engine, created on first use. A content script has
 * exactly one page, so a module singleton is the right default; tests and hosts
 * that need isolation should call {@link createActionAPI} directly.
 */
export function defaultActionAPI(): ActionEngine {
  defaultEngine ??= createActionAPI();
  return defaultEngine;
}
