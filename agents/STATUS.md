# Agent Status Board

Run objective: build DIGGY 2.0 (Personal AI Browser Companion) with the Monitor Engine as the USP.
Coordinator: this Command Code session in `C:\Users\Ayush\orca\projects\DIGGY 2.O`.
Leader run id / coordinator handle: _(filled in when the Orca Run is created)_.

## Live workers

| Worker | Worktree / branch | Terminal / Dispatch | Brief | State |
|---|---|---|---|---|
| core | `DIGGY 2.O/core` / `agent/core` | _pending_ | `agents/core.md` | queued |
| avatar | `DIGGY 2.O/avatar` / `agent/avatar` | _pending_ | `agents/avatar.md` | blocked on core (contracts) |
| brain | `DIGGY 2.O/brain` / `agent/brain` | _pending_ | `agents/brain.md` | blocked on core |
| monitor | `DIGGY 2.O/monitor` / `agent/monitor` | _pending_ | `agents/monitor.md` | queued |
| actions | `DIGGY 2.O/actions` / `agent/actions` | _pending_ | `agents/actions.md` | queued |
| ui | `DIGGY 2.O/ui` / `agent/ui` | _pending_ | `agents/ui.md` | blocked on core |
| forms-vault | `DIGGY 2.O/forms-vault` / `agent/forms-vault` | _pending_ | `agents/forms-vault.md` | queued |
| integrations | `DIGGY 2.O/integrations` / `agent/integrations` | _pending_ | `agents/integrations.md` | queued |
| voice | `DIGGY 2.O/voice` / `agent/voice` | _pending_ | `agents/voice.md` | queued |
| activity | `DIGGY 2.O/activity` / `agent/activity` | _pending_ | `agents/activity.md` | queued |
| qa | `DIGGY 2.O/qa` / `agent/qa` | _pending_ | `agents/qa.md` | queued |

## Coordinator monitoring

```
orca orchestration worker-list --include-remote --json
orca orchestration check --wait --types "worker_done,escalation,question" --timeout-ms 900000 --json
orca orchestration worker-read --dispatch <dispatch_id> --limit 50 --json
```

## Integration log

1. On `worker_done`: review diff for contract violations, secrets, permission creep, locked-data
   exposure, anything that could auto-submit.
2. Merge `agent/<name>` one branch at a time into `main`.
3. After each merge: `pnpm -w typecheck && pnpm -w test && pnpm -w build`.
