$ErrorActionPreference = 'Stop'

$siteRoot = Split-Path -Parent $PSScriptRoot
$keyPath = Join-Path $HOME '.ssh\aliyun_geo_site_ed25519_v3'
$archive = Join-Path $env:TEMP 'yuankun-site.tar.gz'
$server = 'deploy@8.133.228.81'
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) {
  $nodeCommand.Source
} else {
  Join-Path $HOME '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
}

if (-not (Test-Path -LiteralPath $keyPath)) {
  throw "部署密钥不存在：$keyPath"
}

if (-not (Test-Path -LiteralPath $nodePath)) {
  throw "未找到用于生成网站页面的 Node.js：$nodePath"
}

# One publish at a time. A second window (or another AI session) must wait or remove a stale lock.
$lockFile = Join-Path $PSScriptRoot '.publish.lock'
if (Test-Path -LiteralPath $lockFile) {
  $age = (Get-Date) - (Get-Item -LiteralPath $lockFile).LastWriteTime
  if ($age.TotalMinutes -lt 30) { throw "另一个发布正在进行（锁文件 $lockFile，$([int]$age.TotalMinutes) 分钟前创建）。确认没有其他窗口在发布后再删除锁文件。" }
  Write-Warning '发现超过 30 分钟的旧锁文件，已视为失效。'
}
Set-Content -LiteralPath $lockFile -Value "$PID $(Get-Date -Format s)"
try {

& $nodePath (Join-Path $siteRoot 'generate-keywords.mjs')
if ($LASTEXITCODE -ne 0) { throw '问题索引页生成失败' }

& $nodePath (Join-Path $siteRoot 'generate-geo.mjs')
if ($LASTEXITCODE -ne 0) { throw 'GEO页面生成失败' }

& $nodePath (Join-Path $siteRoot 'generate-wechat.mjs')
if ($LASTEXITCODE -ne 0) { throw '公众号草稿包生成失败' }

& $nodePath (Join-Path $siteRoot 'integrate-homes.mjs')
if ($LASTEXITCODE -ne 0) { throw '房源入口更新失败' }

& $nodePath (Join-Path $siteRoot 'validate-site.mjs')
if ($LASTEXITCODE -ne 0) { throw '网站校验失败' }

$publicFiles = @(
  'index.html',
  'homes',
  'about.html',
  'contact.html',
  'knowledge.html',
  'nanxiang-fangchan-zhongjie-yuankunfangwu',
  'services',
  'communities',
  'guides',
  'questions',
  'sitemap.html',
  '404.html',
  'live-qa.js',
  'styles.css',
  'ar-redesign.css',
  'geo-services.css',
  'knowledge-notes.css',
  'robots.txt',
  'llms.txt',
  'sitemap.xml',
  '199864da2cfe47ad866ac58c5257bf4a.txt',
  'feed.xml',
  'assets',
  'answers',
  'data/live-qa.json',
  'data/live-qa.schema.json'
)

# Safety gate: refuse to publish a checkout that is older than what is live (see deploy/preflight.mjs).
& $nodePath (Join-Path $PSScriptRoot 'preflight.mjs')
if ($LASTEXITCODE -ne 0) { throw '发布前检查未通过，已停止，线上未改动。' }

# Use Windows' own bsdtar. When Git for Windows is first on PATH its tar treats
# "C:..." as a remote host and fails, so pick the copy under System32.
$tarExe = (Get-Command tar.exe -All -ErrorAction SilentlyContinue | Where-Object { $_.Source -like '*\System32\*' } | Select-Object -First 1).Source
if (-not $tarExe) { throw '未找到 Windows 自带的 tar.exe（System32）' }
& $tarExe -czf $archive -C $siteRoot @publicFiles
if ($LASTEXITCODE -ne 0) { throw '网站压缩失败' }

scp -i $keyPath -o BatchMode=yes $archive "${server}:/home/deploy/yuankun-site.tar.gz"
if ($LASTEXITCODE -ne 0) { throw '网站上传失败' }

ssh -i $keyPath -o BatchMode=yes $server `
  "tar -xzf /home/deploy/yuankun-site.tar.gz -C /var/www/yuankun && rm -f /home/deploy/yuankun-site.tar.gz"
if ($LASTEXITCODE -ne 0) { throw '服务器解压失败' }

Write-Host '网站已发布。'

# IndexNow: tell Bing and other participating engines about new, changed and removed
# pages. This runs only after a successful publish and can never fail it: indexnow.mjs
# always exits 0 and the call below is wrapped as well. Log: deploy/indexnow.log.
try {
  & $nodePath (Join-Path $siteRoot 'indexnow.mjs')
  if ($LASTEXITCODE -ne 0) { Write-Warning 'IndexNow 推送未成功，网站发布不受影响。' }
} catch {
  Write-Warning "IndexNow 推送出错（网站发布不受影响）：$($_.Exception.Message)"
}
# Queue newly published, approved articles for multi-platform drafts. Queue only: syncing is a
# separate step controlled by data/distribution-control.json (off by default). Never fails a publish.
try { & $nodePath (Join-Path $siteRoot 'distributionadapt.mjs') } catch { Write-Warning "分发队列生成出错（不影响发布）：$($_.Exception.Message)" }
} finally {
  Remove-Item -LiteralPath $lockFile -Force -ErrorAction SilentlyContinue
}
