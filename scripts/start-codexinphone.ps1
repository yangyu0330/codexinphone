param(
    [string]$ProjectPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [switch]$Build,
    [switch]$KeepAwake
)

$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $ProjectPath

function Enable-CodexInPhoneKeepAwake {
    Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class CodexInPhonePower {
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern uint SetThreadExecutionState(uint esFlags);
}
"@

    $ES_CONTINUOUS = 0x80000000
    $ES_SYSTEM_REQUIRED = 0x00000001
    $ES_AWAYMODE_REQUIRED = 0x00000040
    [void][CodexInPhonePower]::SetThreadExecutionState($ES_CONTINUOUS -bor $ES_SYSTEM_REQUIRED -bor $ES_AWAYMODE_REQUIRED)
}

function Disable-CodexInPhoneKeepAwake {
    if ("CodexInPhonePower" -as [type]) {
        $ES_CONTINUOUS = 0x80000000
        [void][CodexInPhonePower]::SetThreadExecutionState($ES_CONTINUOUS)
    }
}

$logDir = Join-Path $ProjectPath "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir ("codexinphone-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".log")

Start-Transcript -Path $logFile -Append | Out-Null
try {
    if ($KeepAwake) {
        Enable-CodexInPhoneKeepAwake
        Write-Host "KeepAwake enabled for this Codex in Phone process."
    }

    if (-not (Test-Path (Join-Path $ProjectPath "node_modules"))) {
        npm ci
    }

    if ($Build -or -not (Test-Path (Join-Path $ProjectPath "dist\server\server\index.js"))) {
        npm run build
    }

    npm run start
}
finally {
    if ($KeepAwake) {
        Disable-CodexInPhoneKeepAwake
    }
    Stop-Transcript | Out-Null
}
