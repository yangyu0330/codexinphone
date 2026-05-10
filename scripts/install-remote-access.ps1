param(
    [ValidateSet("tailscale", "cloudflared")]
    [string]$Provider = "tailscale"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw "winget is required. Install App Installer from Microsoft Store first."
}

switch ($Provider) {
    "tailscale" {
        winget install --id Tailscale.Tailscale --exact --accept-package-agreements --accept-source-agreements
        Write-Host ""
        Write-Host "After install, open Tailscale and log in on this laptop and your phone."
        Write-Host "Then run: tailscale status"
    }
    "cloudflared" {
        winget install --id Cloudflare.cloudflared --exact --accept-package-agreements --accept-source-agreements
        Write-Host ""
        Write-Host "After install, create a Cloudflare Tunnel and protect it with Cloudflare Access."
        Write-Host "Then set PUBLIC_ORIGIN and GITHUB_CALLBACK_URL in .env."
    }
}
