<#
.SYNOPSIS
  Gives folders, drives, "This PC" and Win+E back to Windows Explorer without needing MoonExplorer.exe.

.DESCRIPTION
  Does the same as "MoonExplorer.exe --unset-default", for when the app was moved or deleted.
  Only touches HKEY_CURRENT_USER. Restores the values Moon Explorer backed up, and removes only keys
  that carry Moon Explorer's marker value (MoonExplorer.Owner) and are empty afterwards.
  See docs/default-file-manager.md.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File reset-default-file-manager.ps1 -WhatIf
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param()
$ErrorActionPreference = 'Stop'

$hkcu = [Microsoft.Win32.Registry]::CurrentUser
$C = 'Software\Classes'
$Marker = 'MoonExplorer.Owner'
$StateKey = 'Software\Luna-OS\Moon Explorer\DefaultFileManager'
# Every key Moon Explorer may create, and the value names it writes there (keep in sync with src/default-file-manager/layout.js).
$OurValues = @('', 'Icon', 'AppliesTo', 'DelegateExecute', $Marker)
$KnownKeys = @(
  "$C\Folder", "$C\Folder\shell", "$C\Folder\shell\MoonExplorer", "$C\Folder\shell\MoonExplorer\command",
  "$C\Directory", "$C\Directory\shell",
  "$C\Drive", "$C\Drive\shell", "$C\Drive\shell\MoonExplorer", "$C\Drive\shell\MoonExplorer\command",
  "$C\CLSID\{20D04FE0-3AEA-1069-A2D8-08002B30309D}", "$C\CLSID\{20D04FE0-3AEA-1069-A2D8-08002B30309D}\shell",
  "$C\CLSID\{20D04FE0-3AEA-1069-A2D8-08002B30309D}\shell\MoonExplorer",
  "$C\CLSID\{20D04FE0-3AEA-1069-A2D8-08002B30309D}\shell\MoonExplorer\command",
  "$C\CLSID\{52205fd8-5dfb-447d-801a-d0b52f2e83e1}", "$C\CLSID\{52205fd8-5dfb-447d-801a-d0b52f2e83e1}\shell",
  "$C\CLSID\{52205fd8-5dfb-447d-801a-d0b52f2e83e1}\shell\opennewwindow",
  "$C\CLSID\{52205fd8-5dfb-447d-801a-d0b52f2e83e1}\shell\opennewwindow\command",
  'Software\Luna-OS', 'Software\Luna-OS\Moon Explorer', $StateKey
)

function Get-Val([string]$key, [string]$name) {
  $k = $hkcu.OpenSubKey($key)
  if ($null -eq $k) { return $null }
  try { return $k.GetValue($name, $null, 'DoNotExpandEnvironmentNames') } finally { $k.Close() }
}
function Test-Ours([string]$key) { $null -ne (Get-Val $key $Marker) }

$backup = $null
$raw = Get-Val $StateKey 'Backup'
if ($raw) { try { $backup = $raw | ConvertFrom-Json } catch { Write-Warning 'Backup is unreadable; using the markers only.' } }

$created = @{}
if ($backup) { foreach ($k in $backup.createdKeys) { $created[$k.ToLower()] = $k } }
foreach ($k in $KnownKeys) { if (Test-Ours $k) { $created[$k.ToLower()] = $k } }

# 1. Values in keys that existed before: restore the backup, but only if they still hold what Moon Explorer wrote.
if ($backup) {
  foreach ($v in $backup.values) {
    if ($created.ContainsKey($v.key.ToLower())) { continue }
    $current = Get-Val $v.key $v.name
    if ($current -ne $v.written) { Write-Host "Unverändert (wurde inzwischen geändert): HKCU\$($v.key) [$($v.name)]"; continue }
    if ($PSCmdlet.ShouldProcess("HKCU\$($v.key) [$($v.name)]", 'restore')) {
      $k = $hkcu.OpenSubKey($v.key, $true)
      if ($null -eq $v.previous) { $k.DeleteValue($v.name, $false) } else { $k.SetValue($v.name, [string]$v.previous, 'String') }
      $k.Close()
    }
  }
} else {
  # No backup: only the default verbs that name our verb are ours.
  foreach ($key in "$C\Folder\shell", "$C\Drive\shell", "$C\CLSID\{20D04FE0-3AEA-1069-A2D8-08002B30309D}\shell") {
    if (-not $created.ContainsKey($key.ToLower()) -and (Get-Val $key '') -eq 'MoonExplorer' -and $PSCmdlet.ShouldProcess("HKCU\$key [default]", 'remove')) {
      $k = $hkcu.OpenSubKey($key, $true); $k.DeleteValue('', $false); $k.Close()
    }
  }
}
if ((Get-Val $StateKey 'Backup') -and $PSCmdlet.ShouldProcess("HKCU\$StateKey [Backup]", 'remove')) {
  $k = $hkcu.OpenSubKey($StateKey, $true); $k.DeleteValue('Backup', $false); $k.Close()
}

# 2. Keys Moon Explorer created: remove its values, then the key if it is empty. Deepest first.
foreach ($key in ($created.Values | Sort-Object { ($_ -split '\\').Count } -Descending)) {
  if (-not ($key -like 'Software\Classes\*' -or $key -like 'Software\Luna-OS*')) { continue }
  $k = $hkcu.OpenSubKey($key, $true)
  if ($null -eq $k) { continue }
  if ($PSCmdlet.ShouldProcess("HKCU\$key", 'remove Moon Explorer values / empty key')) {
    foreach ($n in $OurValues) { $k.DeleteValue($n, $false) }
    $empty = ($k.SubKeyCount -eq 0) -and ($k.ValueCount -eq 0)
    $k.Close()
    if ($empty) { $hkcu.DeleteSubKey($key, $false) } else { Write-Host "Behalten (enthält fremde Einträge): HKCU\$key" }
  } else { $k.Close() }
}
if (-not $WhatIfPreference) {
  try {
    Add-Type -Namespace MoonExplorer -Name Shell -MemberDefinition '[DllImport("shell32.dll")] public static extern void SHChangeNotify(int e, uint f, System.IntPtr a, System.IntPtr b);'
    [MoonExplorer.Shell]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero) # SHCNE_ASSOCCHANGED
  } catch { }
}
Write-Host 'Windows Explorer ist wieder der Standard-Dateimanager.'
