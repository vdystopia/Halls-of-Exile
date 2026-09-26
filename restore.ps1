<#
.SYNOPSIS
    Put a backup of the archive back in place of the live database.

.DESCRIPTION
    update.ps1 backs the archive up before every deploy, inside the container's
    volume and to .\backups on this machine. This puts one of those back.

    The database lives in a Docker named volume, not in this folder, so it cannot
    simply be copied over while the container is down: nothing on the host can
    see the volume's path. Instead the app is stopped and a one-off container of
    the same service, which mounts the same volume, copies the backup in. SQLite's
    -wal and -shm files are removed with it, or the restored file would be read
    alongside the write-ahead log of the database it replaced.

    Before anything is replaced, the current archive is itself backed up to
    .\backups, so a restore can be undone the same way.

.PARAMETER From
    The backup to restore. Defaults to the newest in .\backups.

.PARAMETER Yes
    Do not ask for confirmation.

.EXAMPLE
    .\restore.ps1
    .\restore.ps1 -From .\backups\archive-2026-09-25T23-22-54.db
#>
[CmdletBinding()]
param(
    [string]$From,
    [switch]$Yes,
    # For testing against a scratch compose project; leave unset.
    [string]$Project
)

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

$Service = 'halls'
$compose = @('compose')
if ($Project) { $compose += @('-p', $Project) }

function Write-Step { param([string]$Message) Write-Host "==> $Message" -ForegroundColor Cyan }
function Write-Note { param([string]$Message) Write-Host "    $Message" -ForegroundColor DarkGray }

$hostBackups = Join-Path $PSScriptRoot 'backups'
if (-not $From) {
    $newest = Get-ChildItem $hostBackups -Filter 'archive-*.db' -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending | Select-Object -First 1
    if (-not $newest) { throw "No backups in $hostBackups. Pass -From with the file to restore." }
    $From = $newest.FullName
}
$source = (Resolve-Path $From).Path
$name = Split-Path $source -Leaf
$folder = Split-Path $source -Parent

if (-not $Yes) {
    $answer = Read-Host "Replace the live archive with $name? The current one is backed up first. [y/N]"
    if ($answer -notmatch '^(y|yes)$') { Write-Note 'Nothing changed.'; exit 0 }
}

$running = docker @compose ps -q $Service
if (-not [string]::IsNullOrWhiteSpace($running)) {
    Write-Step 'Backing up the current archive first'
    $out = @(docker @compose exec -T $Service node scripts/backup.mjs /data/backups)
    if ($LASTEXITCODE -ne 0) { throw 'Could not back up the current archive, so nothing was replaced.' }
    $inside = ($out | Select-Object -First 1) -replace '\s+\(.*\)$', ''
    New-Item -ItemType Directory -Force -Path $hostBackups | Out-Null
    docker @compose cp "${Service}:$inside" $hostBackups | Out-Null
    Write-Note "$inside, copied to $hostBackups"

    Write-Step 'Stopping the app'
    docker @compose stop $Service | Out-Null
}

Write-Step "Restoring $name"
docker @compose run --rm --no-deps -T -v "${folder}:/restore:ro" --entrypoint sh $Service -c `
    "cp '/restore/$name' /data/archive.db && rm -f /data/archive.db-wal /data/archive.db-shm"
if ($LASTEXITCODE -ne 0) { throw "The copy failed. The app is stopped; start it with: docker compose start $Service" }

if (-not [string]::IsNullOrWhiteSpace($running)) {
    Write-Step 'Starting the app'
    docker @compose start $Service | Out-Null
}
Write-Step 'Restored'
