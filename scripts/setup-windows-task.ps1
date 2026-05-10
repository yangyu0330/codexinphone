param(
    [string]$TaskName = "CodexInPhone",
    [string]$ProjectPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [switch]$AtStartup
)

$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $ProjectPath "scripts\start-codexinphone.ps1"
if (-not (Test-Path -LiteralPath $scriptPath)) {
    throw "Missing start script: $scriptPath"
}

$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" -ProjectPath `"$ProjectPath`""

if ($AtStartup) {
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $trigger.Delay = "PT30S"
} else {
    $trigger = New-ScheduledTaskTrigger -AtLogOn
}

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -MultipleInstances IgnoreNew

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "Start Codex in Phone so a paired phone can control Codex CLI on this laptop." `
    -Force | Out-Null

Write-Host "Registered scheduled task '$TaskName'."
Write-Host "Run it now with: Start-ScheduledTask -TaskName '$TaskName'"
