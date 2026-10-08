# Agent Status Board

Run: `run_93991e284a68` — objective: build DIGGY 2.0 (Personal AI Browser Companion, Monitor Engine USP).
Coordinator handle: `term_236d2216-c43b-462a-8c9e-4e147b5f76e0`.
Project: `C:\Users\Ayush\orca\projects\DIGGY 2.O` (base `main` @ `093cd63`).

## Live workers

| Worker | Worktree / branch | Terminal (handle) | Brief | State |
|---|---|---|---|---|
| core | `orca/workspaces/DIGGY 2.O/core` / `core` | `term_dcb55797-9e71-4bfa-b46f-620fb178d026` | `agents/core.md` | **running** (pilot) |
| avatar | `DIGGY 2.O/avatar` / `agent/avatar` | — | `agents/avatar.md` | queued |
| brain | `DIGGY 2.O/brain` / `agent/brain` | — | `agents/brain.md` | queued |
| monitor | `DIGGY 2.O/monitor` / `agent/monitor` | — | `agents/monitor.md` | queued |
| actions | `DIGGY 2.O/actions` / `agent/actions` | — | `agents/actions.md` | queued |
| ui | `DIGGY 2.O/ui` / `agent/ui` | — | `agents/ui.md` | queued |
| forms-vault | `DIGGY 2.O/forms-vault` / `agent/forms-vault` | — | `agents/forms-vault.md` | queued |
| integrations | `DIGGY 2.O/integrations` / `agent/integrations` | — | `agents/integrations.md` | queued |
| voice | `DIGGY 2.O/voice` / `agent/voice` | — | `agents/voice.md` | queued |
| activity | `DIGGY 2.O/activity` / `agent/activity` | — | `agents/activity.md` | queued |
| qa | `DIGGY 2.O/qa` / `agent/qa` | — | `agents/qa.md` | queued |

## Spawn recipe (validated on the core pilot)

1. `orca worktree create --name <name> --base-branch main --json` (or `worker-start --worktree new-child --name <name> --agent command-code`).
2. `orca terminal create --worktree name:<name> --command "cmdc" --title <name> --json`.
3. First-ever Command Code launch shows a **language chooser** — send Enter once (now cached globally).
4. `orca terminal send --terminal <handle> --text "<spec>" --enter --json` (Command Code cannot report delivery — inspect with `terminal read`).

**Constraint observed:** the core worker's Command Code plan reports *83% used, 12.2 credits left*. Fan-out
size must respect that budget.

## Coordinator monitoring

```
orca orchestration worker-list --include-remote --json
orca orchestration check --wait --types "worker_done,escalation,question" --timeout-ms 900000 --json
orca terminal read --terminal <handle> --limit 45 --json
```

## Integration log

1. On completion: review diff for contract violations, secrets, permission creep, locked-data exposure, auto-submit.
2. Merge `core` first (skeleton + contracts), then one branch at a time into `main`.
3. After each merge: `$env:NODE_ENV="development"; pnpm -w typecheck && pnpm -w test && pnpm -w build`.
