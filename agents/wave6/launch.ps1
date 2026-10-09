# Wave 6 launch — sequential with one retry each.
#
# Two things learned in wave 5 and baked in here:
#   * Orca cannot detect readiness for the `command-code` TUI, so supervised
#     worker-start always times out at agent_readiness for it. `opencode` is
#     recognized, so every worker uses it.
#   * Readiness also times out when four launches run at once on this 5.9 GB box,
#     so launches are sequential and a failed dispatch is retried once with
#     --retry-of on the same worktree (the documented recovery for `failed`).

Set-Location "C:\Users\Ayush\orca\projects\DIGGY 2.O"

$project = "7038525a-ab9e-41a9-b410-4ff04a1bd02a"
$jobs = @(
  @{ name = "w6-settings";     title = "dual API keys and web search settings"; brief = "agents/wave6/w6-settings.md" },
  @{ name = "w6-vault";        title = "vault runtime and screen";              brief = "agents/wave6/w6-vault.md" },
  @{ name = "w6-integrations"; title = "one-click integrations with brand marks"; brief = "agents/wave6/w6-integrations.md" },
  @{ name = "w6-ui-audit";     title = "sidebar and button audit";              brief = "agents/wave6/w6-ui-audit.md" }
)

function Start-Worker($job, $attempt) {
  $spec = "Read agents/wave6/README.md then $($job.brief) and do exactly that task. Own only the files your brief names - other workers are editing other files in parallel. Read agents/wave5/README.md for the shared conventions. If node_modules is missing, run 'pnpm install --no-frozen-lockfile' once first (5.9 GB RAM: never run two installs or two tsc runs at once; TURBO_CONCURRENCY=2). Do not commit and do not push. Finish by sending worker_done with --outcome, your exact commands and output, and the signatures your brief asks for."

  if ($attempt -eq 1) {
    $json = orca orchestration worker-start --spec $spec --worktree new-child --name $job.name `
      --task-title $job.title --agent opencode --setup run --timeout-ms 420000 --json 2>&1
  } else {
    $failed = $json | Out-String | ConvertFrom-Json
    $task = $failed.result.taskId
    $dispatch = $failed.result.dispatchId
    if (-not $task) { Write-Output "!! $($job.name): no taskId to retry"; return }
    Write-Output "RETRY $($job.name) task=$task retry-of=$dispatch"
    $json = orca orchestration worker-start --task $task --retry-of $dispatch `
      --worktree "id:$project::C:/Users/Ayush/orca/workspaces/DIGGY 2.O/$($job.name)" `
      --agent opencode --timeout-ms 420000 --json 2>&1
  }

  $state = ($json | Out-String | ConvertFrom-Json).result.state
  Write-Output "$($job.name) attempt $attempt -> $state"
  return $state
}

foreach ($job in $jobs) {
  $state = Start-Worker $job 1
  if ($state -ne "ready") { Start-Worker $job 2 | Out-Null }
}

Write-Output "=== WAVE 6 LAUNCHED ==="
