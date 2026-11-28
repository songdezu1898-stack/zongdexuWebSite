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
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'deploy-if-changed.ps1')
Step 'adapt'     'distribution\adapt.mjs' @()
Step 'dispatch'  'distribution\dispatch.mjs' @('--run')
Step 'drive-out' 'distribution\drive-bridge.mjs' @('out')
Step 'report'    'distribution\drive-bridge.mjs' @('report')
