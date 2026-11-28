# Deploys the website only when ALL of these hold:
#   1. data/distribution-control.json -> autoPublishSite is true (the safety switch; off by default)
#   2. data/live-qa.json changed since the last successful deploy
#   3. deploy\publish.ps1 passes its own preflight (live data newer than local blocks it), lock and validation
# Never runs article distribution and never publishes to any platform.
$ErrorActionPreference = 'Continue'
$siteRoot = Split-Path -Parent $PSScriptRoot
$log = Join-Path $siteRoot 'distribution\logs\deploy.log'
New-Item -ItemType Directory -Force -Path (Split-Path $log) | Out-Null
function Log($m) { Add-Content -LiteralPath $log -Value ("{0} {1}" -f (Get-Date -Format s), $m) }
try {
  $ctl = Get-Content -Raw -Encoding UTF8 (Join-Path $siteRoot 'data\distribution-control.json') | ConvertFrom-Json
  if ($ctl.autoPublishSite -ne $true) { Log 'skipped: autoPublishSite is off'; exit 0 }
  $dataFile = Join-Path $siteRoot 'data\live-qa.json'
  $stamp = Join-Path $siteRoot 'distribution\logs\last-deployed-hash.txt'
  $h = (Get-FileHash -Algorithm SHA256 $dataFile).Hash
  if ((Test-Path $stamp) -and ((Get-Content $stamp -ErrorAction SilentlyContinue) -eq $h)) { Log 'skipped: no change since last deploy'; exit 0 }
  Log 'deploying: live-qa.json changed'
  $out = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $siteRoot 'deploy\publish.ps1') 2>&1 | Out-String
  $code = $LASTEXITCODE
  $tail = ($out.Trim() -split "`r?`n" | Select-Object -Last 6) -join ' | '
  Log ("publish exit {0}: {1}" -f $code, $tail)
  if ($code -eq 0 -and $out -match 'PREFLIGHT_OK') { Set-Content -LiteralPath $stamp -Value $h; Log 'deploy recorded' }
  else { Log 'deploy NOT recorded (will retry next run)' }
} catch { Log ("error: " + $_.Exception.Message) }
