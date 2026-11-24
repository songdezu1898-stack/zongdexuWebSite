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

& $nodePath (Join-Path $siteRoot 'generate-keywords.mjs')
if ($LASTEXITCODE -ne 0) { throw '问题索引页生成失败' }

& $nodePath (Join-Path $siteRoot 'generate-geo.mjs')
if ($LASTEXITCODE -ne 0) { throw 'GEO页面生成失败' }

& $nodePath (Join-Path $siteRoot 'generate-wechat.mjs')
if ($LASTEXITCODE -ne 0) { throw '公众号草稿包生成失败' }

& $nodePath (Join-Path $siteRoot 'validate-site.mjs')
if ($LASTEXITCODE -ne 0) { throw '网站校验失败' }

$publicFiles = @(
  'index.html',
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
  'feed.xml',
  'assets',
  'answers',
  'data/live-qa.json',
  'data/live-qa.schema.json'
)

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
