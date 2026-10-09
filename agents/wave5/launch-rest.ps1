# Start w5b-monitor and w5b-google, retrying a failed readiness probe once.
#
# Orca's agent_readiness probe is flaky on this machine under load, so a start
# can fail with terminal_handle_stale / timeout even though the worktree and the
# agent terminal were created. The recovery for a proven `failed` dispatch is a
# replacement named with --retry-of on the same worktree, which is what the
# second attempt does.

Set-Location "C:\Users\Ayush\orca\projects\DIGGY 2.O"

$project = "7038525a-ab9e-41a9-b410-4ff04a1bd02a"
$jobs = @(
  @{
    name  = "w5b-monitor"
    title = "monitor and activity runtime"
    spec  = "Read agents/wave5/README.md then agents/wave5/w5-monitor.md and do exactly that task. Own only the three new files those briefs name. If node_modules is missing run 'pnpm install --no-frozen-lockfile' once first (5.9 GB RAM: never two installs at once; TURBO_CONCURRENCY=2). Do not commit and do not push. Finish by sending worker_done with --outcome, your exact commands and output, and the exported signatures your brief asks for."
  },
  @{
    name  = "w5b-google"
    title = "official Google connect via PKCE"
    spec  = "Read agents/wave5/README.md then agents/wave5/w5-google.md and do exactly that task. Own only the four files those briefs name; never touch entrypoints/background.ts and never add a client secret. If node_modules is missing run 'pnpm install --no-frozen-lockfile' once first (5.9 GB RAM: never two installs at once; TURBO_CONCURRENCY=2). Do not commit and do not push. Finish by sending worker_done with --outcome, your exact commands and output, and the redirect URI your build produces."
  }
)

function Start-Worker($job, $attempt) {
  $wt = "id:$project::C:/Users/Ayush/orca/workspaces/DIGGY 2.O/$($job.name)"
  if ($attempt -eq 1) {
    $json = orca orchestration worker-start --spec $job.spec --worktree new-child --name $job.name `
      --task-title $job.title --agent opencode --setup run --timeout-ms 420000 --json 2>&1
  } else {
    $failed = $json | Out-String | ConvertFrom-Json
    $task = $failed.result.taskId
    $dispatch = $failed.result.dispatchId
    if (-not $task) { Write-Output "no taskId to retry for $($job.name)"; return $null }
    Write-Output "RETRY $($job.name) task=$task retry-of=$dispatch"
    $json = orca orchestration worker-start --task $task --retry-of $dispatch --worktree $wt `
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

Write-Output "=== BATCH DONE ==="
