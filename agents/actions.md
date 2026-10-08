# Worker brief — actions

Read `agents/ORCHESTRATION_BRIEF.md` first.

## Goal

The Action Engine: read, click, navigate, type, extract, fill — safely, with plan-before-act and a
hard rule that the agent never submits. Implement `ActionAPI` + `PolicyDecision` from
`packages/shared/src/contracts/action.ts`.

## Owns (only edit these)

`packages/page-agent/**`, `packages/policy/**`.

## Deliverables

1. `page-agent`: port `snapshot/click/type/select/pressKey/scroll/waitFor/navigate/goBack/dom/ref-registry`
   from `C:\Users\Ayush\orca\projects\diggy\packages\page-agent`. Add an **accessibility-tree snapshot**
   (webbrain approach) so targeting is not brittle-selector dependent.
2. `page-agent/src/tool-registry.ts`: a browser-use-style tool registry where each action has a
   `description` + returns `ActionResult` with `extractedContent`.
3. `page-agent/src/plan.ts`: plan-before-act — produce a `Plan` for approval, then execute only after
   approval; each step re-checked against policy.
4. `page-agent/src/playbook.ts`: saved workflows / learn-from-demonstration (webbrain `/teach` concept):
   record a successful run into a reusable, value-free workflow.
5. `policy`: port `classify/decide/taint/sites/quarantine/untrusted/vault` from
   `C:\Users\Ayush\orca\projects\diggy\packages\policy`. Enforce: **never auto-submit**, approval for
   irreversible steps, sensitive-site blocklist (banks/exam/payment), prompt-injection defense
   (page text is data), and treat `TrustedInputAdapter` (chrome.debugger path) as a documented stub.
6. Wire `ActionAPI` from the extension (`policy-host.ts`, `agent-host.ts` patterns in the seed repo).

## Constraints / do-not-touch

- Edit only `packages/page-agent/**` and `packages/policy/**`.
- The final Submit/Confirm is **never** in the generated plan; it must be a human click (or explicit voice confirm).
- No CAPTCHA/OTP bypass. No reading of locked vault plaintext.

## Observable acceptance

- Tests: an irreversible step is classified `irreversible` and requires approval; injection fixtures
  ("ignore previous instructions", hidden text) are ignored and flagged; no plan contains a submit step.
- `pnpm -w typecheck` + `pnpm -w build` green.

## Report

Files changed, exact test command + result, and the policy matrix you implemented.
