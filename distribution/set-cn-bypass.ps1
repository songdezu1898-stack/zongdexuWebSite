# Adds domestic content-platform domains to the Windows system-proxy bypass list so Edge reaches them
# directly from the real local network. Only appends; never touches the proxy server, mode or other entries.
# Overseas tools (ChatGPT, Claude, Google) are not listed, so they keep using the existing proxy.
$key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings'
$wanted = @('*.qq.com','*.weixin.qq.com','*.zhihu.com','*.zhimg.com','*.toutiao.com','*.bytedance.com','*.byteimg.com','*.snssdk.com','*.baidu.com','*.bdstatic.com','*.baidubce.com','*.sohu.com','*.sohucs.com','*.weibo.com','*.weibo.cn','*.sinaimg.cn','*.xiaohongshu.com','*.xhscdn.com','*.douyin.com','*.douyinpic.com','*.amemv.com','*.163.com','*.126.net','*.netease.com')
$cur = (Get-ItemProperty $key).ProxyOverride -split ';' | Where-Object { $_ }
$add = $wanted | Where-Object { $cur -notcontains $_ }
if ($add) {
  Set-ItemProperty $key -Name ProxyOverride -Value (($cur + $add) -join ';')
  # tell running programs to re-read the setting
  Add-Type -Name N -Namespace W -MemberDefinition '[DllImport("wininet.dll")] public static extern bool InternetSetOption(IntPtr h,int o,IntPtr b,int l);'
  [W.N]::InternetSetOption([IntPtr]::Zero,39,[IntPtr]::Zero,0) | Out-Null
  [W.N]::InternetSetOption([IntPtr]::Zero,37,[IntPtr]::Zero,0) | Out-Null
}
"added: $($add.Count)"
