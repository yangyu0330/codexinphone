param(
    [string]$ProjectPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [string]$TaskName = "CodexInPhone",
    [switch]$RegisterTask,
    [switch]$StartTask,
    [switch]$KeepAwake,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$ProjectPath = (Resolve-Path -LiteralPath $ProjectPath).Path
Set-Location -LiteralPath $ProjectPath

$failures = [System.Collections.Generic.List[string]]::new()
$warnings = [System.Collections.Generic.List[string]]::new()

function Add-Failure([string]$Message) {
    $failures.Add($Message) | Out-Null
    Write-Host "[FAIL] $Message" -ForegroundColor Red
}

function Add-Warning([string]$Message) {
    $warnings.Add($Message) | Out-Null
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Add-Ok([string]$Message) {
    Write-Host "[ OK ] $Message" -ForegroundColor Green
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

function Require-Value($envMap, [string]$Name) {
    if (-not $envMap.ContainsKey($Name) -or [string]::IsNullOrWhiteSpace($envMap[$Name])) {
        Add-Failure "$Name is missing in .env"
        return $false
    }
    if ($envMap[$Name] -match "your-|example\.com|paste-|change-this") {
        Add-Failure "$Name still contains a placeholder value."
        return $false
    }
    Add-Ok "$Name is present"
    return $true
}

Write-Host "Codex in Phone away-mode preflight"
Write-Host "Project: $ProjectPath"

if (-not (Test-Path -LiteralPath ".env")) {
    Add-Failure ".env is missing. Copy .env.example to .env and fill OAuth/API/tunnel values before leaving."
} else {
    Add-Ok ".env exists"
}

$envMap = Read-DotEnv (Join-Path $ProjectPath ".env")

if ($envMap.Count -gt 0) {
    $authMode = $envMap["AUTH_MODE"]
    if ($authMode -eq "dev") {
        Add-Failure "AUTH_MODE=dev is only for local testing. Use github or token before leaving."
    } elseif ($authMode -in @("github", "token")) {
        Add-Ok "AUTH_MODE=$authMode"
    } else {
        Add-Failure "AUTH_MODE must be github or token for away mode."
    }

    if ((Require-Value $envMap "SESSION_SECRET") -and $envMap["SESSION_SECRET"].Length -lt 32) {
        Add-Failure "SESSION_SECRET must be at least 32 characters."
    }

    if (Require-Value $envMap "PUBLIC_ORIGIN") {
        $publicOrigin = $envMap["PUBLIC_ORIGIN"]
        if ($publicOrigin -match "^http://(127\.0\.0\.1|localhost)") {
            Add-Warning "PUBLIC_ORIGIN is localhost. Phone access outside home will need Tailscale Serve/Funnel or Cloudflare Tunnel URL."
        } elseif ($publicOrigin -notmatch "^https://") {
            Add-Failure "PUBLIC_ORIGIN should be https for outside access."
        } else {
            Add-Ok "PUBLIC_ORIGIN is HTTPS"
        }
    }

    if ($authMode -eq "github") {
        Require-Value $envMap "GITHUB_CLIENT_ID" | Out-Null
        Require-Value $envMap "GITHUB_CLIENT_SECRET" | Out-Null
        Require-Value $envMap "GITHUB_CALLBACK_URL" | Out-Null
        if (
            (
                (-not $envMap.ContainsKey("ALLOWED_EMAILS")) -or
                [string]::IsNullOrWhiteSpace($envMap["ALLOWED_EMAILS"]) -or
                $envMap["ALLOWED_EMAILS"] -match "your-|example\.com"
            ) -and
            (
                (-not $envMap.ContainsKey("ALLOWED_GITHUB_LOGINS")) -or
                [string]::IsNullOrWhiteSpace($envMap["ALLOWED_GITHUB_LOGINS"]) -or
                $envMap["ALLOWED_GITHUB_LOGINS"] -match "your-"
            )
        ) {
            Add-Failure "Set ALLOWED_EMAILS or ALLOWED_GITHUB_LOGINS for GitHub OAuth."
        } else {
            Add-Ok "OAuth allowlist is present"
        }
    }

    if ($authMode -eq "token") {
        if ((Require-Value $envMap "PAIRING_TOKEN") -and $envMap["PAIRING_TOKEN"].Length -lt 32) {
            Add-Failure "PAIRING_TOKEN must be at least 32 characters."
        }
    }

    if ($envMap.ContainsKey("CODEX_COMMAND") -and -not [string]::IsNullOrWhiteSpace($envMap["CODEX_COMMAND"])) {
        $cmd = Get-Command $envMap["CODEX_COMMAND"] -ErrorAction SilentlyContinue
        if ($cmd) {
            Add-Ok "CODEX_COMMAND resolves: $($envMap['CODEX_COMMAND'])"
        } else {
            Add-Failure "CODEX_COMMAND does not resolve on PATH: $($envMap['CODEX_COMMAND'])"
        }
    }
}

if (Get-Command node -ErrorAction SilentlyContinue) {
    Add-Ok "node is available: $(node --version)"
} else {
    Add-Failure "node is not available"
}

if (Get-Command npm -ErrorAction SilentlyContinue) {
    Add-Ok "npm is available: $(npm --version)"
} else {
    Add-Failure "npm is not available"
}

if (Get-Command tailscale -ErrorAction SilentlyContinue) {
    Add-Ok "tailscale is installed"
    try {
        tailscale status --json *> $null
        Add-Ok "tailscale status is available"
    } catch {
        Add-Warning "tailscale is installed but status failed. Log in before leaving."
    }
} elseif (Get-Command cloudflared -ErrorAction SilentlyContinue) {
    Add-Ok "cloudflared is installed"
} else {
    Add-Warning "No tailscale/cloudflared command found. Install one remote access method before using the app outside the local network."
}

if (-not $SkipBuild) {
    npm run build
    if ($LASTEXITCODE -eq 0) {
        Add-Ok "build passed"
    } else {
        Add-Failure "build failed"
    }
}

if ($envMap.Count -gt 0) {
    $oldNodeEnv = $env:NODE_ENV
    try {
        $env:NODE_ENV = "production"
        npm run check:prod-config
        if ($LASTEXITCODE -eq 0) {
            Add-Ok "production config check passed"
        } else {
            Add-Failure "production config check failed"
        }
    } finally {
        $env:NODE_ENV = $oldNodeEnv
    }
}

if ($RegisterTask) {
    $taskArgs = @("-ExecutionPolicy", "Bypass", "-File", ".\scripts\setup-windows-task.ps1", "-TaskName", $TaskName, "-ProjectPath", $ProjectPath)
    if ($KeepAwake) {
        $taskArgs += "-KeepAwake"
    }
    powershell @taskArgs
    if ($LASTEXITCODE -eq 0) {
        Add-Ok "scheduled task registered: $TaskName"
    } else {
        Add-Failure "scheduled task registration failed"
    }
}

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
    Add-Ok "scheduled task exists: $TaskName"
} else {
    Add-Warning "scheduled task '$TaskName' is not registered. Use -RegisterTask before leaving."
}

if ($StartTask) {
    if (-not $task) {
        Add-Failure "cannot start missing scheduled task '$TaskName'"
    } else {
        Start-ScheduledTask -TaskName $TaskName
        Start-Sleep -Seconds 5
        Add-Ok "scheduled task start requested"
    }
}

try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:8787/health" -TimeoutSec 5
    if ($health.ok -eq $true) {
        Add-Ok "local health endpoint is reachable"
    } else {
        Add-Failure "local health endpoint returned an unexpected payload"
    }
} catch {
    Add-Warning "local health endpoint is not reachable. Start the scheduled task or run npm run start before leaving."
}

Write-Host ""
Write-Host "Summary"
Write-Host "Failures: $($failures.Count)"
Write-Host "Warnings: $($warnings.Count)"

if ($failures.Count -gt 0) {
    Write-Host "Away mode is NOT ready." -ForegroundColor Red
    exit 1
}

Write-Host "Away mode preflight passed. Review warnings before leaving." -ForegroundColor Green
exit 0
