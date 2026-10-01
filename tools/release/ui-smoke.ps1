param([Parameter(Mandatory=$true)][string]$Bundle)
$ErrorActionPreference='Stop'
# Construct real WinForms controls without displaying a window or invoking login.
$install=Get-Content -LiteralPath (Join-Path $Bundle 'Install.ps1') -Raw -Encoding UTF8
$install=$install.Replace('[void]$form.ShowDialog()', @'
if ($form.Controls.Count -lt 10) { throw 'Installer controls missing' }
if ($ai.Items.Count -ne 2) { throw 'AI choices missing' }
if ($form.Controls | Where-Object { $_.Text -eq '游戏账号' }) { throw 'Unnecessary account selector remains' }
Write-Output 'Installer controls: PASS'
$form.Dispose()
'@)
& ([scriptblock]::Create($install))
$scratch=Join-Path ([IO.Path]::GetTempPath()) ('wowai-ui-test-'+[Guid]::NewGuid())
New-Item -Path (Join-Path $scratch 'app/bridge') -ItemType Directory -Force | Out-Null
try {
  @{version='test'} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $scratch 'release.json') -Encoding UTF8
  @{addonDir=$scratch;savedVariablesFile=(Join-Path $scratch 'nonexistent');agents=@{codex=@{path=''};workbuddy=@{path=''}}} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $scratch 'app/bridge/config.json') -Encoding UTF8
  $manage=Get-Content -LiteralPath (Join-Path $Bundle 'Manage.ps1') -Raw -Encoding UTF8
  $manage=$manage.Replace('$root=$PSScriptRoot',('$root='''+$scratch.Replace("'","''")+''''))
  $manage=$manage.Replace('[void]$form.ShowDialog()', @'
if ($form.Controls.Count -ne 9) { throw 'Manager controls missing' }
$report=Diagnose
if ($report -notmatch 'test' -or $report -notmatch 'Codex' -or $report -notmatch 'WorkBuddy') { throw 'Diagnostics incomplete' }
Write-Output 'Manager controls and diagnostic report: PASS'
Write-Output $report
$form.Dispose()
'@)
  # Convert the production error popup into a thrown error so automation cannot hang.
  $manage=$manage.Replace('[void][System.Windows.Forms.MessageBox]::Show($_.Exception.Message,''WoW AI''); exit 1','throw')
  & ([scriptblock]::Create($manage))
} finally {
  $resolved=[IO.Path]::GetFullPath($scratch)
  if ([IO.Path]::GetDirectoryName($resolved) -ne [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') -or [IO.Path]::GetFileName($resolved) -notlike 'wowai-ui-test-*') { throw 'Unsafe cleanup target' }
  Remove-Item -LiteralPath $resolved -Recurse -Force
}
