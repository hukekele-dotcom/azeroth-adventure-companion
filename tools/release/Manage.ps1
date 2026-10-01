param([ValidateSet('Menu','Start','Stop','Login','Diagnose')][string]$Action='Menu', [ValidateSet('codex','workbuddy')][string]$Provider='codex')
$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$node=Join-Path $root 'runtime/node.exe'
$entry=Join-Path $root 'app/bridge/supervisor.js'
$config=Join-Path $root 'app/bridge/config.json'
Add-Type -AssemblyName System.Windows.Forms
function OwnBridges {
  @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -and $_.CommandLine.Contains($entry) })
}
function StartBridge {
  if (OwnBridges) { return '桥接已在运行。游戏中输入 /wow-ai 打开面板。' }
  $cfg=Get-Content -LiteralPath $config -Raw -Encoding UTF8 | ConvertFrom-Json
  $selected=$cfg.agents.($cfg.agent).path
  if (!$selected -or !(Test-Path -LiteralPath $selected)) { throw '所选 AI 尚未安装。请点击登录对应 AI，完成工具安装和账号登录。' }
  $env:PATH=(Join-Path $root 'runtime')+';'+$env:PATH
  $null=Start-Process -FilePath $node -ArgumentList ('"'+$entry+'"') -WorkingDirectory (Join-Path $root 'app') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $root 'app/bridge/startup.log') -RedirectStandardError (Join-Path $root 'app/bridge/startup-error.log')
  Start-Sleep -Milliseconds 900
  if (!(OwnBridges)) { throw '桥接启动失败，请在管理窗口中打开日志查看原因。' }
  return '桥接进程已启动；尚未验证 AI 通信。请重新启动游戏，输入 /wow-ai 并发送一条消息。'
}
function StopBridge {
  foreach ($p in (OwnBridges)) {
    # Only the exact installed supervisor and its child processes are stopped.
    & taskkill.exe /PID $p.ProcessId /T /F | Out-Null
    if ($LASTEXITCODE -ne 0) { throw '停止桥接失败，请查看任务管理器。' }
  }
  return '桥接已停止。冒险档案仍保存在本机。'
}
function LoginAI($selected) {
  if (OwnBridges) { throw '登录或更换 AI 配置前，请先停止桥接。' }
  & $node (Join-Path $root 'ai.cjs') $selected
  if ($LASTEXITCODE -ne 0) { throw '登录流程未成功完成，请查看上方信息后重试。' }
}
function Diagnose {
  $cfg=Get-Content -LiteralPath $config -Raw -Encoding UTF8 | ConvertFrom-Json
  $checks=@(('版本：'+(Get-Content -LiteralPath (Join-Path $root 'release.json') -Raw | ConvertFrom-Json).version),
    ('桥接运行：'+[bool](OwnBridges)), ('插件目录存在：'+(Test-Path -LiteralPath $cfg.addonDir)),
    ('游戏存档：'+$(if ($cfg.savedVariablesRoot) {'自动识别（所有本机游戏账号）'} else {[string](Test-Path -LiteralPath $cfg.savedVariablesFile)})),
    ('Codex 工具：'+[bool]($cfg.agents.codex.path -and (Test-Path -LiteralPath $cfg.agents.codex.path))),
    ('WorkBuddy 工具：'+[bool]($cfg.agents.workbuddy.path -and (Test-Path -LiteralPath $cfg.agents.workbuddy.path))),
    '账号认证与游戏内通信：请分别发送消息验证；本检查不访问账号。')
  return ($checks -join "`r`n")
}
try {
  if ($Action -eq 'Start') { [void][System.Windows.Forms.MessageBox]::Show((StartBridge),'WoW AI'); exit }
  if ($Action -eq 'Stop') { [void][System.Windows.Forms.MessageBox]::Show((StopBridge),'WoW AI'); exit }
  if ($Action -eq 'Login') { try { LoginAI $Provider } finally { Read-Host '按回车关闭此窗口' | Out-Null }; exit }
  if ($Action -eq 'Diagnose') { Write-Output (Diagnose); exit }
  Add-Type -AssemblyName System.Drawing
  [System.Windows.Forms.Application]::EnableVisualStyles()
  $form=New-Object System.Windows.Forms.Form
  $form.Text='WoW AI · 无限内测版'; $form.Size=New-Object System.Drawing.Size(540,390); $form.StartPosition='CenterScreen'
  $form.Font=New-Object System.Drawing.Font('Microsoft YaHei UI',10)
  $status=New-Object System.Windows.Forms.Label
  $status.Location=New-Object System.Drawing.Point(22,18); $status.Size=New-Object System.Drawing.Size(490,80)
  $status.Text='开启桥接后，游戏中输入 /wow-ai。切换 AI 前需分别完成一次登录。'; $form.Controls.Add($status)
  function Btn($text,$x,$y,$handler) {
    $b=New-Object System.Windows.Forms.Button; $b.Text=$text; $b.Location=New-Object System.Drawing.Point($x,$y); $b.Size=New-Object System.Drawing.Size(230,40)
    $b.Add_Click($handler); $form.Controls.Add($b)
  }
  Btn '启动桥接' 22 102 { try {$status.Text=StartBridge} catch {$status.Text=$_.Exception.Message} }
  Btn '停止桥接' 270 102 { try {$status.Text=StopBridge} catch {$status.Text=$_.Exception.Message} }
  function OpenLogin($providerName) {
    Start-Process powershell.exe -WindowStyle Normal -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -File "'+(Join-Path $root 'Manage.ps1')+'" -Action Login -Provider '+$providerName)
  }
  Btn '登录 Codex' 22 155 { OpenLogin 'codex' }
  Btn '登录 WorkBuddy' 270 155 { OpenLogin 'workbuddy' }
  Btn '查看冒险档案' 22 208 {
    $cfg=Get-Content -LiteralPath $config -Raw -Encoding UTF8 | ConvertFrom-Json
    if (Test-Path -LiteralPath $cfg.adventureDir) { Start-Process explorer.exe -ArgumentList ('"'+$cfg.adventureDir+'"') } else {$status.Text='尚未产生电脑端档案，请在游戏中同步日志。'}
  }
  Btn '安装状态检查' 270 208 { try {[void][System.Windows.Forms.MessageBox]::Show((Diagnose),'本机状态')} catch {$status.Text=$_.Exception.Message} }
  Btn '说明 / 說明 / Help' 22 261 {
    try { Start-Process -FilePath (Join-Path $root 'README.html') }
    catch { Start-Process notepad.exe -ArgumentList ('"'+(Join-Path $root 'README.txt')+'"') }
  }
  Btn '打开桥接日志目录' 270 261 { Start-Process explorer.exe -ArgumentList ('"'+(Join-Path $root 'app/bridge')+'"') }
  [void]$form.ShowDialog()
} catch { [void][System.Windows.Forms.MessageBox]::Show($_.Exception.Message,'WoW AI'); exit 1 }
