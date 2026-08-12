param(
    [string]$Repository = 'techiesreviews/techies-playground'
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw 'GitHub CLI is required. Install gh, authenticate, and run this script again.'
}

$authenticatedUser = (gh api user --jq .login).Trim()
if ($authenticatedUser -ne 'techiesreviews') {
    throw "Deployment setup must be run as techiesreviews; gh is authenticated as $authenticatedUser."
}

$accountId = (Read-Host 'Cloudflare account ID').Trim()
if ($accountId -notmatch '^[a-f0-9]{32}$') {
    throw 'The Cloudflare account ID must contain 32 hexadecimal characters.'
}

$secureToken = Read-Host 'Scoped Cloudflare API token' -AsSecureString
$tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)

try {
    $plainToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
    if ([string]::IsNullOrWhiteSpace($plainToken)) {
        throw 'The Cloudflare API token cannot be empty.'
    }

    $plainToken | gh secret set CLOUDFLARE_API_TOKEN --repo $Repository
    gh variable set CLOUDFLARE_ACCOUNT_ID --body $accountId --repo $Repository
    gh variable set CLOUDFLARE_DEPLOY_ENABLED --body true --repo $Repository
    gh workflow run deploy.yml --ref main --repo $Repository
}
finally {
    $plainToken = $null
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
}

Write-Host 'Production deployment is enabled. Follow it with:'
Write-Host "gh run watch --repo $Repository"
