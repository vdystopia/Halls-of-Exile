<#
.SYNOPSIS
    Update the deployed archive: back up, pull, rebuild, health-check, roll back on failure.

.DESCRIPTION
    Run this instead of `docker compose up -d --build`. It takes a consistent
    backup first, records the current commit and image so a bad build can be
    undone, and only reports success once /api/health answers.

    Windows blocks unsigned scripts by default. Either allow them once:
        Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
    or run this without changing the policy:
        powershell -ExecutionPolicy Bypass -File .\update.ps1

.PARAMETER SkipBackup
    Skip the pre-update backup. Only sensible on an instance with no data yet.

.PARAMETER HealthTimeoutSeconds
    How long to wait for the new container to report healthy before rolling back.
#>
[CmdletBinding()]
param(
    [switch]$SkipBackup,
    [int]$HealthTimeoutSeconds = 150
)

$ErrorActionPreference = 'Stop'
# Native commands are checked through $LASTEXITCODE below, not by throwing.
$PSNativeCommandUseErrorActionPreference = $false

Set-Location -Path $PSScriptRoot

$Service = 'halls'
$Image = 'halls-of-exile'
$RollbackImage = "${Image}:rollback"

function Write-Step { param([string]$Message) Write-Host "==> $Message" -ForegroundColor Cyan }
function Write-Note { param([string]$Message) Write-Host "    $Message" -ForegroundColor DarkGray }
function Write-Bad  { param([string]$Message) Write-Host "!!! $Message" -ForegroundColor Red }

function Get-HostPort {
    if (Test-Path '.env') {
        $match = Select-String -Path '.env' -Pattern '^\s*HOST_PORT\s*=\s*(\d+)' | Select-Object -First 1
        if ($match) { return [int]$match.Matches[0].Groups[1].Value }
    }
    return 3000
}

function Test-Health {
    param([string]$Url, [int]$TimeoutSeconds)
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-RestMethod -Uri $Url -TimeoutSec 5
            if ($response.status -eq 'ok') { return $response }
        } catch {
            # container still starting
        }
        Start-Sleep -Seconds 3
    }
    return $null
}

function Invoke-Rollback {
    param([string]$Commit, [bool]$HadImage)
    Write-Bad 'Update failed. Rolling back.'
    git reset --hard $Commit | Out-Null
    if ($HadImage) {
        docker tag $RollbackImage $Image | Out-Null
        docker compose up -d | Out-Null
        Write-Note "Restored commit $($Commit.Substring(0,7)) and the previous image."
    } else {
        docker compose down | Out-Null
        Write-Note "Restored commit $($Commit.Substring(0,7)). There was no previous image to restore."
    }
}

# --- preconditions -----------------------------------------------------------
if (-not (Test-Path 'docker-compose.yml')) {
    throw "No docker-compose.yml here. Run this from the repository folder."
}
# Only tracked changes matter: rollback resets tracked files and leaves
# untracked ones (stray backups, notes) alone.
if (git status --porcelain --untracked-files=no) {
    throw "There are uncommitted changes to tracked files. Commit or discard them first - this script resets the tree on failure."
}

# Only one update at a time. Two concurrent runs race on the git index and on
# the compose project, and a rollback from the loser can undo the winner's
# deploy. The lock is an exclusively-held file handle rather than a PID file, so
# a killed run leaves nothing stale behind: Windows closes the handle with the
# process.
$lockPath = Join-Path $PSScriptRoot '.update.lock'
try {
    $lock = [System.IO.File]::Open(
        $lockPath,
        [System.IO.FileMode]::OpenOrCreate,
        [System.IO.FileAccess]::ReadWrite,
        [System.IO.FileShare]::None)
} catch [System.IO.IOException] {
    throw "An update is already running in another window. Wait for it to finish, then re-run."
}

try {

    $port = Get-HostPort
    $healthUrl = "http://127.0.0.1:$port/api/health"
    $previousCommit = (git rev-parse HEAD).Trim()

    # `image ls -q` prints the id or nothing, and never writes to stderr. Silencing
    # `image inspect` with `*> $null` instead is fatal in Windows PowerShell 5.1
    # under 'Stop' the first time there is no image to inspect.
    $hadImage = -not [string]::IsNullOrWhiteSpace((docker image ls -q $Image))
    if ($hadImage) { docker tag $Image $RollbackImage | Out-Null }

    # --- backup ------------------------------------------------------------------
    $containerId = (docker compose ps -q $Service)
    if ($SkipBackup) {
        Write-Step 'Skipping backup (requested)'
    } elseif ([string]::IsNullOrWhiteSpace($containerId)) {
        Write-Step 'Nothing running yet, so no backup to take'
    } else {
        Write-Step 'Backing up the archive'
        $backupOutput = @(docker compose exec -T $Service node scripts/backup.mjs /data/backups)
        if ($LASTEXITCODE -ne 0) {
            throw "Backup failed. Refusing to update. Re-run with -SkipBackup only if you accept losing the current data."
        }
        $backupOutput | ForEach-Object { Write-Note $_ }
        # The backup is written inside the volume, beside the database, so losing
        # the volume would lose both. A copy goes to .\backups on the host, which
        # restore.ps1 reads from. The newest 20 are kept there too.
        $inside = ($backupOutput | Select-Object -First 1) -replace '\s+\(.*\)$', ''
        $hostBackups = Join-Path $PSScriptRoot 'backups'
        New-Item -ItemType Directory -Force -Path $hostBackups | Out-Null
        docker compose cp "${Service}:$inside" $hostBackups | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Note "copied to $hostBackups"
            Get-ChildItem $hostBackups -Filter 'archive-*.db' | Sort-Object Name -Descending |
                Select-Object -Skip 20 | Remove-Item -Force
        } else {
            Write-Bad 'The backup could not be copied out of the container; it is only inside the volume.'
        }
    }

    # --- pull --------------------------------------------------------------------
    Write-Step 'Fetching the latest code'
    git pull --ff-only
    if ($LASTEXITCODE -ne 0) {
        throw "git pull failed. Resolve it by hand, then re-run."
    }
    $newCommit = (git rev-parse HEAD).Trim()
    if ($newCommit -eq $previousCommit) {
        Write-Note 'Already up to date. Rebuilding anyway to pick up any local changes.'
    }

    # --- art ---------------------------------------------------------------------
    # public/ is copied into the image, so the art on disk when the image is built
    # is the art the container serves, and fetching it afterwards changes nothing
    # until the next rebuild. The pull above may have brought new indexes, so what
    # they name and the disk lacks is fetched here, before the build — which also
    # covers watch.ps1, whose deploys come through this script. `art:fetch --check`
    # compares every file against where it belongs, for both games; this used to
    # count PNGs, which never saw Path of Exile 2's WebP and let gem pictures stand
    # in for missing item pictures. Art is optional: trouble here warns, and the
    # deploy carries on with silhouettes where pictures are missing.
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        Write-Bad 'npm is not on PATH, so item art was not checked.'
    } else {
        Write-Step 'Checking item art'
        npm run --silent art:fetch -- --check
        if ($LASTEXITCODE -eq 3) {
            Write-Step 'Fetching the missing item art'
            npm run --silent art:fetch
            npm run --silent art:fetch -- --check
            if ($LASTEXITCODE -ne 0) { Write-Bad 'Some item art is still missing; those items draw a silhouette.' }
        } elseif ($LASTEXITCODE -ne 0) {
            Write-Bad "The art check could not run (exit code $LASTEXITCODE)."
            Write-Note 'Run npm install --ignore-scripts, then npm run art:fetch, and deploy again.'
        }
    }
    if (-not (Test-Path (Join-Path $PSScriptRoot 'public/ascendancy.webp'))) {
        Write-Bad 'The ascendancy emblem sheet is missing.'
        Write-Note 'Run npm run art:fetch and deploy again; character cards show no emblem without it.'
    }

# --- build and start ---------------------------------------------------------
    Write-Step 'Building and starting the container'
    docker compose up -d --build
    if ($LASTEXITCODE -ne 0) {
        Invoke-Rollback -Commit $previousCommit -HadImage $hadImage
        throw "Build failed. The previous version is running again."
    }

    # --- verify ------------------------------------------------------------------
    Write-Step "Waiting for $healthUrl"
    $health = Test-Health -Url $healthUrl -TimeoutSeconds $HealthTimeoutSeconds
    if (-not $health) {
        Write-Bad 'The new container never reported healthy. Last 40 log lines:'
        docker compose logs --tail 40 $Service
        Invoke-Rollback -Commit $previousCommit -HadImage $hadImage
        throw "Update rolled back."
    }

    Write-Step 'Live'
    Write-Note "commit     $($newCommit.Substring(0,7))"
    Write-Note "url        http://localhost:$port"
    Write-Note "players    $($health.users)"
    Write-Note "characters $($health.characters)"
    Write-Note "leagues    $($health.leagues)"
    Write-Note "The previous image is kept as $RollbackImage if you need it."

} finally {
    $lock.Dispose()
    # -Force: a dot-prefixed name counts as hidden, which Remove-Item refuses to
    # delete without it. Leaving the file behind would be harmless — the lock is
    # the handle, not the file — but it would show up as untracked noise.
    Remove-Item $lockPath -Force -ErrorAction SilentlyContinue
}
