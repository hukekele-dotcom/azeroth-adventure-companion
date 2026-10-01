$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
$bundle = $PSScriptRoot
$script:installTarget = Join-Path $env:LOCALAPPDATA 'WoWAI-Forever'
$form = New-Object System.Windows.Forms.Form
$form.Text = 'WoW AI · 无限内测版安装'
$form.Size = New-Object System.Drawing.Size(680,500)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.Font = New-Object System.Drawing.Font('Microsoft YaHei UI',10)
function Label($text,$x,$y,$w,$h) {
  $c=New-Object System.Windows.Forms.Label
  $c.Text=$text; $c.Location=New-Object System.Drawing.Point($x,$y); $c.Size=New-Object System.Drawing.Size($w,$h)
  $form.Controls.Add($c); return $c
}
function Button($text,$x,$y,$w) {
  $c=New-Object System.Windows.Forms.Button
  $c.Text=$text; $c.Location=New-Object System.Drawing.Point($x,$y); $c.Size=New-Object System.Drawing.Size($w,36)
  $form.Controls.Add($c); return $c
}
$null=Label '先安装，再登录 AI，最后启动桥接和游戏。' 24 20 430 32
$help=Button '说明 / 說明 / Help' 462 16 174
$help.Add_Click({
  try { Start-Process -FilePath (Join-Path $bundle 'README.html') }
  catch { Start-Process notepad.exe -ArgumentList ('"'+(Join-Path $bundle 'README.txt')+'"') }
})
$null=Label '游戏目录（包含 WowB.exe，通常是 _classic_beta_）' 24 62 600 26
$game=New-Object System.Windows.Forms.TextBox
$game.Location=New-Object System.Drawing.Point(24,92); $game.Size=New-Object System.Drawing.Size(488,28)
$form.Controls.Add($game)
$browse=Button '选择目录' 524 88 112
$null=Label '默认 AI（游戏里也可切换，需各自登录）' 24 138 600 24
$ai=New-Object System.Windows.Forms.ComboBox
$ai.DropDownStyle='DropDownList'; $ai.Location=New-Object System.Drawing.Point(24,168); $ai.Size=New-Object System.Drawing.Size(612,28)
[void]$ai.Items.AddRange(@('Codex','WorkBuddy')); $ai.SelectedIndex=0; $form.Controls.Add($ai)
$null=Label "安装到：$script:installTarget`n无需选择游戏账号；升级保留聊天、AI 配置和冒险档案。" 24 211 612 52
$null=Label 'AI 使用你自己的账号和额度。发送时会附带角色、任务等游戏信息；生成游记会发送冒险记录。WorkBuddy 使用官方 CodeBuddy 执行引擎，需单独登录，不读取桌面会话。' 24 269 612 72
$install=Button '1. 安装 / 升级' 24 350 190
$login=Button '2. 登录所选 AI' 234 350 192
$start=Button '3. 启动桥接' 446 350 190
$status=Label '请退出游戏和旧桥接，再选择客户端目录。' 24 407 612 45
function Core($action,$argsObject) {
  $tmp=Join-Path ([IO.Path]::GetTempPath()) ('wowai-install-'+[Guid]::NewGuid()+'.json')
  try {
    [IO.File]::WriteAllText($tmp,($argsObject | ConvertTo-Json -Depth 12),(New-Object Text.UTF8Encoding($false)))
    $output=& (Join-Path $bundle 'runtime/node.exe') (Join-Path $bundle 'installer.cjs') $action $tmp 2>&1
    $exitCode=$LASTEXITCODE
    $result=($output -join "`n") | ConvertFrom-Json
    if ($exitCode -ne 0 -or $result.ok -eq $false) { throw $result.error }
    return $result
  } finally { if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp } }
}
function CheckClient {
  $null=Core 'discover' @{client=$game.Text}
  $status.Text='客户端目录有效，可直接安装；游戏存档将自动识别。'
}
$browse.Add_Click({
  $dialog=New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.Description='选择包含 WowB.exe 的客户端目录'
  if ($dialog.ShowDialog() -eq 'OK') {
    $game.Text=$dialog.SelectedPath
    try { CheckClient } catch { $status.Text=$_.Exception.Message }
  }
})
$game.Add_Leave({ if ($game.Text) { try { CheckClient } catch { $status.Text=$_.Exception.Message } } })
$install.Add_Click({
  try {
    $install.Enabled=$false; $status.Text='正在校验文件、备份旧插件并安装，请稍候……'; $form.Refresh()
    $result=Core 'install' @{bundle=$bundle;target=$script:installTarget;client=$game.Text;provider=$ai.Text.ToLowerInvariant()}
    $shell=New-Object -ComObject WScript.Shell
    $shortcut=$shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'WoW AI 无限.lnk'))
    $shortcut.TargetPath=Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
    $shortcut.Arguments='-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+(Join-Path $script:installTarget 'Manage.ps1')+'"'
    $shortcut.WorkingDirectory=$script:installTarget; $shortcut.Save()
    $status.Text=$result.message
  } catch { $status.Text=$_.Exception.Message; [void][System.Windows.Forms.MessageBox]::Show($_.Exception.Message,'安装未完成') }
  finally { $install.Enabled=$true }
})
function OpenManager($action) {
  $file=Join-Path $script:installTarget 'Manage.ps1'
  if (!(Test-Path -LiteralPath (Join-Path $script:installTarget 'installation.json'))) { throw '请先完成安装。' }
  $style=if ($action -eq 'Login') {'Normal'} else {'Hidden'}
  Start-Process powershell.exe -WindowStyle $style -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -File "'+$file+'" -Action '+$action+' -Provider '+$ai.Text.ToLowerInvariant())
}
$login.Add_Click({ try { OpenManager 'Login' } catch { $status.Text=$_.Exception.Message } })
$start.Add_Click({ try { OpenManager 'Start' } catch { $status.Text=$_.Exception.Message } })
[void]$form.ShowDialog()
