param(
    [string]$ProjectPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [ValidateSet("github", "token")]
    [string]$AuthMode = "github",
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$ProjectPath = (Resolve-Path -LiteralPath $ProjectPath).Path
$envPath = Join-Path $ProjectPath ".env"
$examplePath = Join-Path $ProjectPath ".env.example"

if ((Test-Path -LiteralPath $envPath) -and -not $Force) {
    Write-Host ".env already exists: $envPath"
    Write-Host "Use -Force to regenerate it."
    exit 0
}

if (-not (Test-Path -LiteralPath $examplePath)) {
    throw "Missing .env.example: $examplePath"
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

$sessionSecret = New-Secret 48
$pairingToken = New-Secret 32
$content = Get-Content -LiteralPath $examplePath -Raw

$content = $content -replace '(?m)^NODE_ENV=.*$', 'NODE_ENV=production'
$content = $content -replace '(?m)^AUTH_MODE=.*$', "AUTH_MODE=$AuthMode"
$content = $content -replace '(?m)^SESSION_SECRET=.*$', "SESSION_SECRET=$sessionSecret"
$content = $content -replace '(?m)^PAIRING_TOKEN=.*$', "PAIRING_TOKEN=$pairingToken"
$content = $content -replace '(?m)^COOKIE_SECURE=.*$', 'COOKIE_SECURE=false'
$content = $content -replace '(?m)^CODEX_COMMAND=.*$', 'CODEX_COMMAND=codex'
$content = $content -replace '(?m)^WORKSPACE_ROOTS=.*$', "WORKSPACE_ROOTS=$env:USERPROFILE"
$content = $content -replace '(?m)^DEFAULT_CWD=.*$', "DEFAULT_CWD=$env:USERPROFILE"

[System.IO.File]::WriteAllText($envPath, $content, [System.Text.UTF8Encoding]::new($false))

Write-Host "Created $envPath"
Write-Host "AUTH_MODE=$AuthMode"
Write-Host "SESSION_SECRET generated"
if ($AuthMode -eq "token") {
    Write-Host ""
    Write-Host "Pairing token for your phone:"
    Write-Host $pairingToken
}
Write-Host ""
Write-Host "Next: edit .env and fill PUBLIC_ORIGIN plus OAuth/API values before leaving."
