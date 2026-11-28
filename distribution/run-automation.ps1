# Unattended pipeline step, run by Windows Task Scheduler (no Claude Code, no API calls).
# Order: Drive 03 -> inbox -> candidate items -> queue -> (gated) Wechatsync drafts -> Drive 01/04.
# Any step may fail without stopping the others. Log: distribution/logs/automation.log
$ErrorActionPreference = 'Continue'
$siteRoot = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { exit 0 }
$log = Join-Path $siteRoot 'distribution\logs\automation.log'
New-Item -ItemType Directory -Force -Path (Split-Path $log) | Out-Null
function Step($name, $script, $arguments) {
  try { $out = & $node (Join-Path $siteRoot $script) @arguments 2>&1 | Out-String } catch { $out = $_.Exception.Message }
  Add-Content -LiteralPath $log -Value ("{0} [{1}] {2}" -f (Get-Date -Format s), $name, ($out.Trim() -replace "`r?`n", ' | '))
}
$env:NODE_USE_ENV_PROXY = '1'
Step 'drive-in'  'distribution\drive-bridge.mjs' @('in')
Step 'ingest'    'distribution\ingest-inbox.mjs' @()
# Website deploy is outward-facing, so it has its own switch (data/distribution-control.json -> autoPublishSite, off by default).
# It runs only when live-qa.json changed since the last successful deploy, and deploy\publish.ps1 keeps its own preflight/lock.
try {
  $ctl = Get-Content -Raw -Encoding UTF8 (Join-Path $siteRoot 'data\distribution-control.json') | ConvertFrom-Json
  if ($ctl.autoPublishSite -eq $true) {
    $dataFile = Join-Path $siteRoot 'data\live-qa.json'
    $stamp = Join-Path $siteRoot 'distribution\logs\last-deployed-hash.txt'
    $h = (Get-FileHash -Algorithm SHA256 $dataFile).Hash
    if (-not (Test-Path $stamp) -or (Get-Content $stamp -ErrorAction SilentlyContinue) -ne $h) {
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $siteRoot 'deploy\publish.ps1') *>&1 | Out-String | ForEach-Object { Add-Content -LiteralPath $log -Value ("{0} [deploy] {1}" -f (Get-Date -Format s), (($_.Trim() -replace "`r?`n", ' | ')).Substring(0, [Math]::Min(600, $_.Trim().Length))) }
      if ($LASTEXITCODE -eq 0) { Set-Content -LiteralPath $stamp -Value $h }
    }
  }
} catch { Add-Content -LiteralPath $log -Value ("{0} [deploy] error: {1}" -f (Get-Date -Format s), $_.Exception.Message) }
Step 'adapt'     'distribution\adapt.mjs' @()
Step 'dispatch'  'distribution\dispatch.mjs' @('--run')
Step 'drive-out' 'distribution\drive-bridge.mjs' @('out')
Step 'report'    'distribution\drive-bridge.mjs' @('report')
