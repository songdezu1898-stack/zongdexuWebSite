param([Parameter(Mandatory=$true)][ValidatePattern('^[A-Za-z0-9_-]{1,40}$')][string]$ListingId,[Parameter(Mandatory=$true)][ValidateSet('available','off_market','sold')][string]$Status)
$ErrorActionPreference='Stop'
$catalogPath=Join-Path $PSScriptRoot 'homes\listings.json'
$rows=Get-Content -LiteralPath $catalogPath -Raw | ConvertFrom-Json
$entry=@($rows | Where-Object id -EQ $ListingId)
if($entry.Count -ne 1){throw '房源编号不存在或不唯一'}
$backupDir=Join-Path $PSScriptRoot 'deploy\backups'
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
Copy-Item -LiteralPath $catalogPath -Destination (Join-Path $backupDir ('homes-before-'+$ListingId+'-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'.json'))
$entry[0].status=$Status
$rows | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $catalogPath -Encoding utf8
$keyPath=Join-Path ([Environment]::GetFolderPath('UserProfile')) '.ssh\aliyun_geo_site_ed25519_v3'
scp -i $keyPath -o BatchMode=yes $catalogPath 'deploy@8.133.228.81:/var/www/yuankun/homes/listings.json.next'
if($LASTEXITCODE -ne 0){throw '上传失败，线上未修改'}
ssh -i $keyPath -o BatchMode=yes deploy@8.133.228.81 'cp -p /var/www/yuankun/homes/listings.json /home/deploy/backups/homes-20261125/listings-before-status.json; mv /var/www/yuankun/homes/listings.json.next /var/www/yuankun/homes/listings.json'
if($LASTEXITCODE -ne 0){throw '服务器更新失败，请检查'}
Write-Output "$ListingId 已设为 $Status；照片和资料保留。"
