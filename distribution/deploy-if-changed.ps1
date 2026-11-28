# Deploys the website only when ALL of these hold:
#   1. data/distribution-control.json -> autoPublishSite is true (the safety switch; off by default)
#   2. data/live-qa.json changed since the last successful deploy
#   3. the pre-deploy gate (deploy\preflight.mjs: local not behind origin, live data not newer, no secrets) passes
# Two ways to go live, in this order:
#   a) pullDeploy = true: build + sign a release and push it to the public `site-release` branch. The SERVER fetches it
#      within 5 minutes (no SSH, works with any home IP). This is the normal path.
#   b) otherwise (or if (a) fails): the old SSH push via deploy\publish.ps1, kept as a fallback.
# Never runs article distribution and never publishes to any platform.
$ErrorActionPreference = 'Continue'
$siteRoot = Split-Path -Parent $PSScriptRoot
$log = Join-Path $siteRoot 'distribution\logs\deploy.log'
New-Item -ItemType Directory -Force -Path (Split-Path $log) | Out-Null
function Log($m) { Add-Content -LiteralPath $log -Value ("{0} {1}" -f (Get-Date -Format s), $m) }
function Short($t) { $s = ($t.Trim() -split "`r?`n" | Select-Object -Last 6) -join ' | '; if ($s.Length -gt 500) { $s.Substring(0, 500) } else { $s } }
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
try {
  $ctl = Get-Content -Raw -Encoding UTF8 (Join-Path $siteRoot 'data\distribution-control.json') | ConvertFrom-Json
  if ($ctl.autoPublishSite -ne $true) { Log 'skipped: autoPublishSite is off'; exit 0 }
  $dataFile = Join-Path $siteRoot 'data\live-qa.json'
  $stamp = Join-Path $siteRoot 'distribution\logs\last-deployed-hash.txt'
  $h = (Get-FileHash -Algorithm SHA256 $dataFile).Hash
  if ((Test-Path $stamp) -and ((Get-Content $stamp -ErrorAction SilentlyContinue) -eq $h)) { Log 'skipped: no change since last deploy'; exit 0 }
  Log 'deploying: live-qa.json changed'
  $ok = $false

  if ($ctl.pullDeploy -eq $true -and $node) {
    # Regenerate pages exactly as publish.ps1 does, then gate, then publish a signed release.
    $gen = @('generate-keywords.mjs', 'generate-geo.mjs', 'generate-wechat.mjs', 'integrate-homes.mjs', 'validate-site.mjs')
    $genOk = $true
    foreach ($g in $gen) { $o = & $node (Join-Path $siteRoot $g) 2>&1 | Out-String; if ($LASTEXITCODE -ne 0) { Log ("generate/validate failed at $g : " + (Short $o)); $genOk = $false; break } }
    if ($genOk) {
      $pre = & $node (Join-Path $siteRoot 'deploy\preflight.mjs') 2>&1 | Out-String
      if ($pre -match 'PREFLIGHT_OK') {
        $rel = & $node (Join-Path $siteRoot 'deploy\pull\publish-release.mjs') 2>&1 | Out-String
        Log ('pull release: ' + (Short $rel))
        if ($rel -match 'PULL_RELEASE_PUSHED') {
          $ok = $true
          # IndexNow runs from this PC right after the release is published (the server may take up to 5 min to pick it up).
          $ix = & $node (Join-Path $siteRoot 'indexnow.mjs') 2>&1 | Out-String; Log ('indexnow: ' + (Short $ix))
        }
      } else { Log ('preflight blocked pull release: ' + (Short $pre)) }
    }
    if (-not $ok) { Log 'pull release did not complete; falling back to SSH push' }
  }

  if (-not $ok) {
    $out = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $siteRoot 'deploy\publish.ps1') 2>&1 | Out-String
    $code = $LASTEXITCODE
    Log ("ssh publish exit {0}: {1}" -f $code, (Short $out))
    if ($code -eq 0 -and $out -match 'PREFLIGHT_OK') { $ok = $true }
  }

  if ($ok) {
    Set-Content -LiteralPath $stamp -Value $h
    Copy-Item -LiteralPath $dataFile -Destination (Join-Path $siteRoot 'deploy\last-deployed-live-qa.json') -Force
    Log 'deploy recorded'
  } else { Log 'deploy NOT recorded (will retry next run)' }
} catch { Log ("error: " + $_.Exception.Message) }
