param(
  [string]$Target
)
if (-not $Target -or $Target -eq '') { $Target = $env:USERPROFILE + '\AppData\Local\Programs\' }
$desktop = [Environment]::GetFolderPath('Desktop')
$WshShell = New-Object -ComObject WScript.Shell
$linkPath = Join-Path $desktop 'CarBooking.lnk'
$shortcut = $WshShell.CreateShortcut($linkPath)
$shortcut.TargetPath = $Target
$shortcut.WorkingDirectory = Split-Path $Target
$shortcut.IconLocation = "$Target,0"
$shortcut.Save()
Exit 0
