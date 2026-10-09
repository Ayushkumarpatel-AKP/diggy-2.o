# Wave 5 — fresh launch.
#
# Why a script: a full task spec inline on the command line exceeds the Windows
# arg limit ("The command line is too long"), so the specs live in the committed
# briefs under agents/wave5/ and each --spec is a one-liner pointing at them.
#
# Agent note: Orca cannot detect readiness for the `command-code` TUI (its prompt
# is not a recognized agent state), so supervised `worker-start` always times out
# at agent_readiness for it. `opencode` is recognized and reaches ready. Workers
# are launched sequentially: this machine has 5.9 GB RAM and concurrent launches
# starve the readiness probe.

Set-Location "C:\Users\Ayush\orca\projects\DIGGY 2.O"

$workers = @(
  @{ name = "w5b-reminders"; title = "reminders engine package";              brief = "agents/wave5/w5-reminders.md" },
  @{ name = "w5b-ui";        title = "bubble actions and live status";        brief = "agents/wave5/w5-ui.md" },
  @{ name = "w5b-monitor";   title = "monitor and activity runtime";          brief = "agents/wave5/w5-monitor.md" },
  @{ name = "w5b-google";    title = "official Google connect via PKCE";      brief = "agents/wave5/w5-google.md" }
)

foreach ($w in $workers) {
  $spec = "Read agents/wave5/README.md then $($w.brief) and do exactly that task. Own only the files those briefs name. Your worktree has no node_modules: run 'pnpm install --no-frozen-lockfile' once before building (5.9 GB RAM: never two installs at once; TURBO_CONCURRENCY=2). Do not commit and do not push. Finish by sending worker_done with --outcome and the evidence your brief asks for."

  Write-Output "=== START $($w.name) ==="
  orca orchestration worker-start --spec $spec --worktree new-child --name $w.name `
    --task-title $w.title --agent opencode --setup run --timeout-ms 420000 --json 2>&1 |
    Select-String -Pattern '"state"|"failedStage"|"lastError"|"dispatchId"|"taskId"' |
    Select-Object -First 6
}

Write-Output "=== WAVE LAUNCHED ==="
