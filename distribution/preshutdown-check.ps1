$ErrorActionPreference = 'SilentlyContinue'
$procs = Get-CimInstance Win32_Process
function Count($pattern) { ($procs | Where-Object { $_.CommandLine -match $pattern -and $_.CommandLine -notmatch 'preshutdown-check' } | Measure-Object).Count }
$rec = Count 'process_three_platform|transcription_queue|six_stream|comment_monitor|obs64|ffmpeg|faster_whisper'
$job = Count 'dispatch\.mjs|publish\.ps1|git (commit|push|pull)|scp |ssh |run-automation|drive-bridge|write-final-report'
$root = 'c:/Users/ykfw/Documents/自动加微信/personal-site'
$locks = (Test-Path "$root/distribution/logs/dispatch.lock") -or (Test-Path "$root/deploy/.publish.lock")
function DriveIo { (Get-CimInstance Win32_Process -Filter "Name='GoogleDriveFS.exe'" | ForEach-Object { $_.WriteTransferCount + $_.ReadTransferCount } | Measure-Object -Sum).Sum }
$a = DriveIo; Start-Sleep -Seconds 30; $b = DriveIo
$obsRec = Get-ChildItem "$HOME/Desktop/LiveReview_3Platforms/临时录屏_自动删除" -Filter *.mkv | Where-Object { $_.LastWriteTime -gt (Get-Date).AddMinutes(-10) }
"录制/转写/OBS 相关进程数: $rec"
"分发/部署/git/传输相关进程数: $job"
"存在锁文件: $locks"
"最近10分钟被写入的录屏文件数: $(($obsRec | Measure-Object).Count)"
"Google Drive 30 秒内读写增量: {0:N0} 字节" -f ($b - $a)
