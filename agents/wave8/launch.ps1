# Wave 8 launch — two workers, sequential, one retry each.
# opencode only (Orca cannot detect the command-code TUI's readiness); sequential
# because concurrent launches starve the readiness probe on this 5.9 GB box.

Set-Location "C:\Users\Ayush\orca\projects\DIGGY 2.O"
$project = "7038525a-ab9e-41a9-b410-4ff04a1bd02a"

$jobs = @(
  @{ name = "w8-parts";   title = "ActionCard Menu and notifications"; brief = "agents/wave8/w8-parts.md" },
  @{ name = "w8-screens"; title = "API keys nav, monitor controls, richer bubble"; brief = "agents/wave8/w8-screens.md" }
)

foreach ($job in $jobs) {
  $spec = "Read agents/wave8/README.md then $($job.brief) and do exactly that task. Own only the files your brief names - another worker is editing other files in parallel. Read agents/wave5/README.md for the shared conventions. If node_modules is missing run 'pnpm install --no-frozen-lockfile' once first (5.9 GB RAM: never two installs or two tsc runs at once; TURBO_CONCURRENCY=2). Do not commit and do not push. Finish by sending worker_done with --outcome and your exact commands and output."

  $json = orca orchestration worker-start --spec $spec --worktree new-child --name $job.name `
    --task-title $job.title --agent opencode --setup run --timeout-ms 420000 --json 2>&1
  $state = ($json | Out-String | ConvertFrom-Json).result.state
  Write-Output "$($job.name) -> $state"

  if ($state -ne "ready") {
    $failed = $json | Out-String | ConvertFrom-Json
    if ($failed.result.taskId) {
      Write-Output "RETRY $($job.name)"
      orca orchestration worker-start --task $failed.result.taskId --retry-of $failed.result.dispatchId `
        --worktree "id:$project::C:/Users/Ayush/orca/workspaces/DIGGY 2.O/$($job.name)" `
        --agent opencode --timeout-ms 420000 --json 2>&1 |
        Select-String -Pattern '"state"' | Select-Object -First 1
    }
  }
}
Write-Output "=== WAVE 8 LAUNCHED ==="
