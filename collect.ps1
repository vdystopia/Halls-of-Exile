<#
.SYNOPSIS
    Refresh every archived character's gear from Path of Exile, unattended.

.DESCRIPTION
    Reads each player's Path of Exile account out of the running archive, pulls
    that account off the game's own character endpoints, and posts the result
    back. Matched characters get their gear, socketed gems, tree jewels and
    passives replaced with what the game reports; their league, memories,
    /played time and main skill are left alone.

    A character the archive has never seen is named in the output and NOT
    created: the league it belongs to is the one thing no export can say, and
    this script has nobody to ask. Those go through the upload page at
    /players/<name>/import, where a league can be picked.

    Set a player's account under "Manage player" on their page first. Without
    one, that player is skipped.

    Collection is incremental. The first run for an account costs about two
    requests per character; later runs cost two, plus two for each character
    that levelled, changed league, or was played in the last twelve hours. The
    collector paces itself against the rate-limit headers, so a run can take a
    few minutes of mostly waiting - that is it being careful, not stuck.

    Run it from this machine. Cloudflare challenges datacentre addresses, and a
    home connection is the point.

    Windows blocks unsigned scripts by default. Either allow them once:
        Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
    or run this without changing the policy:
        powershell -ExecutionPolicy Bypass -File .\collect.ps1

.PARAMETER Player
    Only this player, by archive username. Default: every player with an account.

.PARAMETER Full
    Refetch every character instead of only the ones that changed. Slow, and
    only needed when a past run was interrupted or the stored copy looks wrong.

.PARAMETER Port
    The archive's port. Defaults to HOST_PORT in .env, then 3000.
#>
[CmdletBinding()]
param(
    [string]$Player,
    [switch]$Full,
    [int]$Port
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

Set-Location -Path $PSScriptRoot

function Write-Step { param([string]$Message) Write-Host "==> $Message" -ForegroundColor Cyan }
function Write-Note { param([string]$Message) Write-Host "    $Message" -ForegroundColor DarkGray }
function Write-Bad  { param([string]$Message) Write-Host "!!! $Message" -ForegroundColor Red }

function Get-HostPort {
    if ($Port) { return $Port }
    if (Test-Path '.env') {
        $match = Select-String -Path '.env' -Pattern '^\s*HOST_PORT\s*=\s*(\d+)' | Select-Object -First 1
        if ($match) { return [int]$match.Matches[0].Groups[1].Value }
    }
    return 3000
}

$HostPort = Get-HostPort
$Base = "http://localhost:$HostPort"
$Collector = Join-Path $PSScriptRoot 'tools\poe-char-export\poe-char-export.js'
# Kept between runs so collection stays incremental, and out of git.
$StateDir = Join-Path $PSScriptRoot 'collect'

if (-not (Test-Path $Collector)) {
    Write-Bad "No collector at $Collector."
    exit 1
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Bad 'node is not on PATH. Install Node, or open a new terminal if you just did.'
    exit 1
}

Write-Step "Asking $Base which accounts to read"
try {
    $players = Invoke-RestMethod -Uri "$Base/api/players" -TimeoutSec 20
} catch {
    Write-Bad "The archive did not answer on $Base. Is it running? (docker compose ps)"
    exit 1
}

$targets = @($players | Where-Object { $_.poeAccount })
if ($Player) {
    $targets = @($targets | Where-Object { $_.username -eq $Player })
    if (-not $targets) {
        Write-Bad "No player `"$Player`" with an account set. Set one under `"Manage player`"."
        exit 1
    }
}
if (-not $targets) {
    Write-Bad 'No player has a Path of Exile account set. Set one under "Manage player" on their page.'
    exit 1
}

New-Item -ItemType Directory -Force -Path $StateDir | Out-Null
$failed = 0

foreach ($target in $targets) {
    $account = $target.poeAccount
    $username = $target.username
    # Plain ASCII in anything printed: Windows PowerShell 5.1 reads a file
    # without a BOM as ANSI, which turns a dash like this into mojibake.
    Write-Step "$username / $account"

    # One state file per account, named after it, so an incremental run has the
    # previous export to compare against.
    $safe = ($account -replace '[^\w\-]', '_')
    $out = Join-Path $StateDir "$safe.json"

    # Not $args: that is an automatic variable, and splatting over it is asking
    # for the wrong thing to be passed.
    $collectorArgs = @('--account', $account, '--out', $out, '--user-agent', 'halls-of-exile (self-hosted archive)')
    if ($Full) { $collectorArgs += '--full' }

    & node $Collector @collectorArgs
    $code = $LASTEXITCODE
    if ($code -eq 1) {
        Write-Bad "Collection failed for $account."
        $failed += 1
        continue
    }
    if ($code -eq 2) {
        Write-Note 'Some characters failed to read; importing the rest.'
    }
    if (-not (Test-Path $out)) {
        Write-Bad "The collector wrote nothing to $out."
        $failed += 1
        continue
    }

    Write-Note "Posting to $Base/api/import/poe"
    try {
        $response = Invoke-RestMethod -Uri "$Base/api/import/poe?player=$username" -Method Post `
            -ContentType 'application/json' -InFile $out -TimeoutSec 300
    } catch {
        Write-Bad "The archive rejected the import: $($_.Exception.Message)"
        $failed += 1
        continue
    }

    Write-Note "$($response.updated) of $($response.characters) characters updated"
    if ($response.unmatched -gt 0) {
        Write-Note "$($response.unmatched) not in the archive: $($response.unmatchedNames -join ', ')"
        Write-Note "Add those at $Base/players/$username/import, where a league can be chosen."
    }
}

if ($failed -gt 0) {
    Write-Bad "$failed account(s) failed."
    exit 1
}
Write-Step 'Done.'
