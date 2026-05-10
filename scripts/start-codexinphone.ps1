param(
    [string]$ProjectPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [switch]$Build
)

$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $ProjectPath

$logDir = Join-Path $ProjectPath "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir ("codexinphone-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".log")

Start-Transcript -Path $logFile -Append | Out-Null
try {
    if (-not (Test-Path (Join-Path $ProjectPath "node_modules"))) {
        npm ci
    }

    if ($Build -or -not (Test-Path (Join-Path $ProjectPath "dist\server\server\index.js"))) {
        npm run build
    }

    npm run start
}
finally {
    Stop-Transcript | Out-Null
}
