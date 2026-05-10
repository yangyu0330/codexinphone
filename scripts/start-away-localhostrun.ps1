param(
    [string]$ProjectPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [switch]$NoBuild
)

$ErrorActionPreference = "Stop"
$ProjectPath = (Resolve-Path -LiteralPath $ProjectPath).Path
Set-Location -LiteralPath $ProjectPath

if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) {
    throw "OpenSSH client is not installed. Install Windows OpenSSH Client first."
}

function New-Secret([int]$Bytes = 32) {
    $buffer = New-Object byte[] $Bytes
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $rng.GetBytes($buffer)
    } finally {
        $rng.Dispose()
    }
    return [Convert]::ToBase64String($buffer).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

function Read-DotEnv([string]$Path) {
    $result = @{}
    if (-not (Test-Path -LiteralPath $Path)) {
        return $result
    }

    foreach ($line in Get-Content -LiteralPath $Path) {
        $trimmed = $line.Trim()
        if ($trimmed.Length -eq 0 -or $trimmed.StartsWith("#")) {
            continue
        }
        $parts = $trimmed.Split("=", 2)
        if ($parts.Count -eq 2) {
            $result[$parts[0].Trim()] = $parts[1].Trim().Trim('"').Trim("'")
        }
    }
    return $result
}

function Set-DotEnvValue([string]$Path, [string]$Name, [string]$Value) {
    $lines = @()
    if (Test-Path -LiteralPath $Path) {
        $lines = @(Get-Content -LiteralPath $Path)
    }

    $found = $false
    $updated = foreach ($line in $lines) {
        if ($line -match "^\s*$([regex]::Escape($Name))\s*=") {
            $found = $true
            "$Name=$Value"
        } else {
            $line
        }
    }

    if (-not $found) {
        $updated += "$Name=$Value"
    }

    [System.IO.File]::WriteAllText($Path, ($updated -join [Environment]::NewLine) + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
}

function Enable-KeepAwake {
    Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class CodexInPhoneLocalhostRunPower {
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern uint SetThreadExecutionState(uint esFlags);
}
"@
    $flags = [uint32](2147483648 -bor 1 -bor 64)
    [void][CodexInPhoneLocalhostRunPower]::SetThreadExecutionState($flags)
}

function Disable-KeepAwake {
    if ("CodexInPhoneLocalhostRunPower" -as [type]) {
        [void][CodexInPhoneLocalhostRunPower]::SetThreadExecutionState([uint32]2147483648)
    }
}

function Stop-ProcessTree([int]$ProcessId) {
    $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $ProcessId" -ErrorAction SilentlyContinue)
    foreach ($child in $children) {
        Stop-ProcessTree -ProcessId $child.ProcessId
    }
    Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

$envPath = Join-Path $ProjectPath ".env"
if (-not (Test-Path -LiteralPath $envPath)) {
    powershell -ExecutionPolicy Bypass -File .\scripts\init-local-env.ps1 -AuthMode token
}

$envMap = Read-DotEnv $envPath
$pairingToken = $envMap["PAIRING_TOKEN"]
if ([string]::IsNullOrWhiteSpace($pairingToken) -or $pairingToken.Length -lt 32 -or $pairingToken -match "change-this|your-|paste-") {
    $pairingToken = New-Secret 32
    Set-DotEnvValue $envPath "PAIRING_TOKEN" $pairingToken
}

if (-not $NoBuild) {
    npm run build
    if ($LASTEXITCODE -ne 0) {
        throw "Build failed."
    }
}

$logDir = Join-Path $ProjectPath "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$tunnelOut = Join-Path $logDir "localhostrun.out.log"
$tunnelErr = Join-Path $logDir "localhostrun.err.log"
$serverOut = Join-Path $logDir "away-server.out.log"
$serverErr = Join-Path $logDir "away-server.err.log"
Remove-Item -LiteralPath $tunnelOut,$tunnelErr,$serverOut,$serverErr -ErrorAction SilentlyContinue

$sshTunnel = $null
$publicOrigin = $null
for ($attempt = 1; $attempt -le 3 -and -not $publicOrigin; $attempt++) {
    Remove-Item -LiteralPath $tunnelOut,$tunnelErr -ErrorAction SilentlyContinue
    Write-Host "Starting localhost.run SSH tunnel (attempt $attempt/3)..."
    $sshTunnel = Start-Process -FilePath "ssh.exe" `
        -ArgumentList @(
            "-o", "StrictHostKeyChecking=accept-new",
            "-o", "ExitOnForwardFailure=yes",
            "-o", "ServerAliveInterval=30",
            "-o", "ServerAliveCountMax=3",
            "-R", "80:127.0.0.1:8787",
            "nokey@localhost.run"
        ) `
        -WorkingDirectory $ProjectPath `
        -WindowStyle Hidden `
        -RedirectStandardOutput $tunnelOut `
        -RedirectStandardError $tunnelErr `
        -PassThru

    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Seconds 1
        $raw = ""
        if (Test-Path -LiteralPath $tunnelOut) {
            $raw += Get-Content -LiteralPath $tunnelOut -Raw -ErrorAction SilentlyContinue
        }
        if (Test-Path -LiteralPath $tunnelErr) {
            $raw += "`n" + (Get-Content -LiteralPath $tunnelErr -Raw -ErrorAction SilentlyContinue)
        }
        $match = [regex]::Match($raw, "https://[a-zA-Z0-9.-]+\.lhr\.life")
        if ($match.Success) {
            $publicOrigin = $match.Value
            break
        }
        if ($sshTunnel.HasExited) {
            break
        }
    }

    if (-not $publicOrigin) {
        Stop-ProcessTree -ProcessId $sshTunnel.Id
        Start-Sleep -Seconds 2
    }
}

if (-not $publicOrigin) {
    throw "Could not create a localhost.run tunnel after 3 attempts. Check $tunnelErr and $tunnelOut"
}

Set-Content -LiteralPath (Join-Path $logDir "away-localhostrun-url.txt") -Value $publicOrigin -NoNewline

Set-DotEnvValue $envPath "NODE_ENV" "production"
Set-DotEnvValue $envPath "AUTH_MODE" "token"
Set-DotEnvValue $envPath "PUBLIC_ORIGIN" $publicOrigin
Set-DotEnvValue $envPath "COOKIE_SECURE" "true"
Set-DotEnvValue $envPath "TRUST_PROXY" "1"
Set-DotEnvValue $envPath "GITHUB_CALLBACK_URL" "$publicOrigin/auth/github/callback"
Set-DotEnvValue $envPath "WORKSPACE_ROOTS" $env:USERPROFILE
Set-DotEnvValue $envPath "DEFAULT_CWD" $env:USERPROFILE

Write-Host "Starting Codex in Phone server..."
$server = Start-Process -FilePath "node.exe" `
    -ArgumentList "dist/server/server/index.js" `
    -WorkingDirectory $ProjectPath `
    -WindowStyle Hidden `
    -RedirectStandardOutput $serverOut `
    -RedirectStandardError $serverErr `
    -PassThru

try {
    Enable-KeepAwake

    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 1
        try {
            $health = Invoke-RestMethod -Uri "http://127.0.0.1:8787/health" -TimeoutSec 3
            if ($health.ok -eq $true) {
                break
            }
        } catch {
            if ($server.HasExited) {
                throw "Server exited early. Check $serverErr"
            }
        }
    }

    Write-Host ""
    Write-Host "Away localhost.run tunnel is running."
    Write-Host "Phone URL:"
    Write-Host $publicOrigin
    Write-Host ""
    Write-Host "Pairing token:"
    Write-Host $pairingToken
    Write-Host ""
    Write-Host "Keep this PowerShell window/session running while you are away."
    Write-Host "Press Ctrl+C to stop the tunnel and server."
    Write-Host ""

    while (-not $server.HasExited -and -not $sshTunnel.HasExited) {
        Start-Sleep -Seconds 5
    }

    if ($server.HasExited) {
        throw "Codex in Phone server stopped. Check $serverErr"
    }
    if ($sshTunnel.HasExited) {
        throw "localhost.run SSH tunnel stopped. Check $tunnelErr and $tunnelOut"
    }
} finally {
    Disable-KeepAwake
    Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
    Stop-ProcessTree -ProcessId $sshTunnel.Id
}
