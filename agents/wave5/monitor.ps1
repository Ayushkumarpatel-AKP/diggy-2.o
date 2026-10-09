# Wave 5 monitor — waits on worker deliveries and logs them, with a fleet
# snapshot each tick. Runs until every worker settles or it hits its cap.
#
#   powershell -File agents/wave5/monitor.ps1 -Log <path>
#
# `orca orchestration check --wait` blocks until a Delivery lands (worker_done,
# escalation or question) and replays the oldest one until it is acknowledged,
# so this never misses a message and never double-processes one.

param([string]$Log = "$env:TEMP\wave5-monitor.log", [int]$IntervalSec = 30)

$run = "run_ebe27af501f4"

function Say($message) {
  $line = "$(Get-Date -Format 'HH:mm:ss')  $message"
  Write-Output $line
  Add-Content -Path $Log -Value $line -ErrorAction SilentlyContinue
}

function Fleet {
  $raw = orca orchestration worker-list --run $run --json 2>&1 | Out-String
  try {
    $workers = ($raw | ConvertFrom-Json).result.workers
  } catch {
    return $null
  }
  return $workers
}

Set-Content -Path $Log -Value "=== wave 5 monitor started $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ==="
Say "watching run $run"
Say "polling every $IntervalSec s — each tick spawns an orca process, and this machine has 5.9 GB of RAM shared with four workers, so a tight loop here actively starves them."

for ($tick = 1; $tick -le 200; $tick++) {
  $raw = orca orchestration check --types "worker_done,escalation,question" --json 2>&1 | Out-String
  $id = $null
  $type = $null
  $from = $null
  $body = $null
  try {
    $parsed = $raw | ConvertFrom-Json
    $result = $parsed.result
    $delivery = if ($result.deliveries) { $result.deliveries[0] } else { $result.delivery }
    if ($delivery) {
      $id = $delivery.id
      $type = $delivery.type
      $from = $delivery.from
      $body = [string]$delivery.body
    }
  } catch {
    Say "check output was not JSON: $($raw.Substring(0, [Math]::Min(200, $raw.Length)))"
  }

  if ($id) {
    $flat = ($body -replace '\s+', ' ').Trim()
    Say "DELIVERY [$type] from $from"
    Say "   $flat"
    # Ack so the next wait returns the following message instead of this one.
    orca orchestration check --ack $id --json 2>&1 | Out-Null
  } else {
    Say "tick $tick — no deliveries yet"
  }

  $workers = Fleet
  if ($workers) {
    # Liveness is `projection.outcome`, not `workerState`: a worker whose stop was
    # never confirmed reads `stop_unknown` while its agent is still working, and a
    # settled worker's retained terminal still reports `liveness: live`. Only
    # `in_progress` means "still owes work".
    $live = $workers | Where-Object { $_.projection.outcome -eq 'in_progress' }
    $settled = ($workers | Where-Object { $_.projection.outcome -ne 'in_progress' } | Measure-Object).Count
    $names = ($live | ForEach-Object {
        "{0}({1})" -f ($_.resource.worktreeId -replace '.*/', ''), $_.workerState
      }) -join ', '
    Say "   fleet: in_progress=$(@($live).Count) [$names] settled=$settled"
    if (@($live).Count -eq 0) {
      Say "=== every worker settled — monitor exiting ==="
      break
    }
  }

  Start-Sleep -Seconds $IntervalSec
}

Say "=== wave 5 monitor stopped ==="
