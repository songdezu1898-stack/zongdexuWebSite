# Lightweight scheduled step (every 5 minutes): receives ChatGPT's instructions from Drive folder 06,
# turns submitted articles into candidates, and refreshes the 04 status files. It never syncs to any
# platform. Approved articles are queued (adapt) and the Drive 05 plan is refreshed. The website deploys only when the
# autoPublishSite switch is on (off by default). Safe to run while article distribution is switched off.
$ErrorActionPreference = 'Continue'
$siteRoot = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { exit 0 }
$log = Join-Path $siteRoot 'distribution\logs\tasks-runner.log'
New-Item -ItemType Directory -Force -Path (Split-Path $log) | Out-Null
function Step($name, $script, $arguments) {
  try { $out = & $node (Join-Path $siteRoot $script) @arguments 2>&1 | Out-String } catch { $out = $_.Exception.Message }
  $line = ($out.Trim() -replace "`r?`n", ' | ')
  if ($line.Length -gt 400) { $line = $line.Substring(0, 400) }
  Add-Content -LiteralPath $log -Value ("{0} [{1}] {2}" -f (Get-Date -Format s), $name, $line)
}
Step 'tasks'  'distribution\tasks.mjs' @()
Step 'drive-in' 'distribution\drive-bridge.mjs' @('in')
Step 'ingest' 'distribution\ingest-inbox.mjs' @()
Step 'adapt'  'distribution\adapt.mjs' @()
Step 'plan'   'distribution\drive-bridge.mjs' @('plan')
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'deploy-if-changed.ps1')
Step 'drive-out' 'distribution\drive-bridge.mjs' @('out')
Step 'report' 'distribution\drive-bridge.mjs' @('report')
