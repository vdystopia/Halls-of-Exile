<#
.SYNOPSIS
    Deploy and collect on their own, so nobody has to run anything again.

.DESCRIPTION
    Install this once and the archive keeps itself current:

        .\watch.ps1 -Install

    That registers two scheduled tasks under Task Scheduler's \Halls\ folder.

      Halls deploy watch   every few minutes: if Main has moved and its build
                           is green, pull and run update.ps1.
      Halls collect        once a day: run collect.ps1 for every player, which
                           fills in the gear of archived characters that have
                           none yet and touches nothing else.

    Both survive a restart. Neither needs a PowerShell window left open.

    WHY THIS EXISTS. The machine that deploys is this one, behind your own
    network, and it stays that way - no port forwarded, no SSH exposed. So
    nothing outside can push a deploy in; this box has to reach out and check.
    That is the whole reason one command has to be run by hand, and it is the
    only one.

    A build that is red, or still running, is never deployed: the check runs
    for the commit are read first and anything short of green waits for the
    next tick. If GitHub cannot be reached at all it waits too, and says so in
    the log once that has gone on for about an hour - a watcher that refuses to
    deploy while looking healthy is the one failure worth shouting about.
    Everything else is update.ps1's job, including the backup, the health check
    and the rollback.

    Windows blocks unsigned scripts by default. Either allow them once:
        Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
    or run this without changing the policy:
        powershell -ExecutionPolicy Bypass -File .\watch.ps1 -Install

.PARAMETER Install
    Register the two tasks and exit.

.PARAMETER Uninstall
    Remove them and exit.

.PARAMETER Once
    Do one deploy check now and exit, printing what it decided. Use this to
    see what the task will do without waiting for it.

.PARAMETER Collect
    Run the collection now. This is what the daily task calls.

.PARAMETER IntervalMinutes
    How often to look for a new commit on Main. Default 10.

.PARAMETER CollectAt
    Time of day for the daily collection, 24-hour. Default 04:30.
#>
[CmdletBinding()]
param(
    [switch]$Install,
    [switch]$Uninstall,
    [switch]$Once,
    [switch]$Collect,
    [int]$IntervalMinutes = 10,
    [string]$CollectAt = '04:30'
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

Set-Location -Path $PSScriptRoot

$TaskPath = '\Halls\'
$DeployTask = 'Halls deploy watch'
$CollectTask = 'Halls collect'
$LogDir = Join-Path $PSScriptRoot 'logs'
$LogFile = Join-Path $LogDir 'watch.log'

function Write-Step { param([string]$Message) Write-Host "==> $Message" -ForegroundColor Cyan }
function Write-Note { param([string]$Message) Write-Host "    $Message" -ForegroundColor DarkGray }
function Write-Bad  { param([string]$Message) Write-Host "!!! $Message" -ForegroundColor Red }

# Everything a task does goes to the log as well as the console, because a task
# has no console to watch.
function Write-Log {
    param([string]$Message)
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    $line = "{0}  {1}" -f (Get-Date -Format 's'), $Message
    Add-Content -Path $LogFile -Value $line
    Write-Note $Message
}

function Get-RepoSlug {
    # Not `2>$null`: redirecting a native command's stderr is fatal in Windows
    # PowerShell 5.1 under 'Stop' whenever it writes anything there.
    $saved = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { $url = & git remote get-url origin 2>&1 | Where-Object { $_ -is [string] } } finally { $ErrorActionPreference = $saved }
    if ($LASTEXITCODE -ne 0 -or -not $url) { return $null }
    if ($url -match 'github\.com[:/]+(?<owner>[^/]+)/(?<repo>[^/.]+)') {
        return "$($Matches.owner)/$($Matches.repo)"
    }
    return $null
}

<#
    One of four words: green, red, pending, or unreachable.

    "Pending" and "unreachable" both mean wait, but they are not the same thing
    and must not read the same in the log: pending resolves on its own in a few
    minutes, while unreachable, if it keeps happening, means this is quietly
    never deploying anything. Telling them apart is the difference between a
    log that explains a stall and one that hides it.

    The status is read anonymously, which GitHub allows 60 times an hour per
    address. This asks only when there is a new commit to ask about, so a few
    times an hour at most - but set GITHUB_TOKEN in the environment if that
    limit is ever the thing in the way.
#>
function Get-CommitState {
    param([string]$Slug, [string]$Sha)
    $uri = "https://api.github.com/repos/$Slug/commits/$Sha/check-runs"
    $headers = @{ 'Accept' = 'application/vnd.github+json'; 'User-Agent' = 'halls-watch' }
    if ($env:GITHUB_TOKEN) { $headers['Authorization'] = "Bearer $($env:GITHUB_TOKEN)" }
    try {
        $response = Invoke-RestMethod -Uri $uri -Headers $headers -TimeoutSec 30
    } catch {
        Write-Log "Could not read the build status: $($_.Exception.Message)"
        return 'unreachable'
    }
    if (-not $response.check_runs -or @($response.check_runs).Count -eq 0) { return 'pending' }
    foreach ($run in $response.check_runs) {
        if ($run.status -ne 'completed') { return 'pending' }
        if ($run.conclusion -notin @('success', 'neutral', 'skipped')) {
            Write-Log "$($run.name) concluded $($run.conclusion)"
            return 'red'
        }
    }
    return 'green'
}

<#
    How many ticks in a row could not reach GitHub. A stall that nobody can see
    is the failure worth guarding against here: refusing to deploy is right, and
    refusing forever while looking healthy is not.
#>
function Step-Unreachable {
    param([switch]$Reset)
    $file = Join-Path $LogDir 'unreachable.count'
    if ($Reset) {
        if (Test-Path $file) { Remove-Item $file -Force }
        return 0
    }
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    $count = 0
    if (Test-Path $file) { $count = [int](Get-Content $file -Raw).Trim() }
    $count += 1
    Set-Content -Path $file -Value $count
    return $count
}

<#
    Run one of the scripts beside this one as its own PowerShell process, logging
    everything it prints, and return its exit code and output.

    Not `& update.ps1 2>&1`: in Windows PowerShell 5.1, merging a script's error
    stream turns every line a native command writes to stderr into an error
    record, and under 'Stop' the first one ends the script. docker writes its
    progress there, so every deploy from here died at the first docker call —
    the build, or copying the backup out — while working fine by hand. In a
    child process that text is only text, and a failure is the exit code.
#>
function Invoke-Child {
    param([string]$Script)
    $path = Join-Path $PSScriptRoot $Script
    $saved = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $lines = @(& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $path 2>&1 | ForEach-Object { "$_" })
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $saved
    }
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    $lines | Add-Content -Path $LogFile
    $lines | ForEach-Object { Write-Host $_ }
    return @{ Code = $code; Lines = $lines }
}

function Invoke-DeployCheck {
    & git fetch --quiet origin Main
    if ($LASTEXITCODE -ne 0) {
        Write-Log 'git fetch failed; leaving it for the next check.'
        return
    }

    $local = (& git rev-parse HEAD).Trim()
    $remote = (& git rev-parse origin/Main).Trim()
    if ($local -eq $remote) {
        Write-Note "Up to date at $($local.Substring(0,7))."
        return
    }

    $slug = Get-RepoSlug
    if (-not $slug) {
        Write-Log 'Cannot work out the GitHub repository from the origin remote; not deploying blind.'
        return
    }

    $short = $remote.Substring(0, 7)
    $state = Get-CommitState -Slug $slug -Sha $remote
    if ($state -eq 'red') {
        Write-Log "$short is red. Not deploying."
        Step-Unreachable -Reset | Out-Null
        return
    }
    if ($state -eq 'pending') {
        Write-Note "$short has no finished build yet. Waiting."
        Step-Unreachable -Reset | Out-Null
        return
    }
    if ($state -eq 'unreachable') {
        $missed = Step-Unreachable
        # Roughly an hour of failures at the default interval. Loud, because the
        # alternative is looking healthy while deploying nothing, forever.
        if ($missed -ge 6) {
            Write-Log "Still cannot read the build status for $short after $missed tries; nothing has deployed since."
        }
        return
    }
    Step-Unreachable -Reset | Out-Null

    # A commit that failed here once is not tried again until Main moves. It was
    # green in CI and still failed on this machine, so it will fail again, and
    # every attempt is a backup and a full rebuild: after a rollback HEAD is
    # behind Main once more, and without this the next check redeploys it.
    $failedFile = Join-Path $LogDir 'failed-deploy.sha'
    if ((Test-Path $failedFile) -and ((Get-Content $failedFile -Raw).Trim() -eq $remote)) {
        Write-Note "$short failed to deploy here before; waiting for a newer commit. Run .\update.ps1 by hand to retry it."
        return
    }

    Write-Log "Deploying $short."
    # update.ps1 does the rest: backup, pull, rebuild, health check, rollback,
    # and the lock that stops two of these overlapping.
    $run = Invoke-Child 'update.ps1'
    $failure = if ($run.Code -eq 0) { $null } else { ($run.Lines | Where-Object { $_ -match '\S' } | Select-Object -Last 1) }
    if (-not $failure) {
        Write-Log "Deployed $short."
        if (Test-Path $failedFile) { Remove-Item $failedFile -Force }
    } elseif ($run.Lines -match 'already running') {
        # Another update holds the lock: nothing is wrong with the commit.
        Write-Log "Deploy of $short deferred: another update is running."
    } else {
        Write-Log "Deploy of $short failed (exit code $($run.Code)): $failure"
        New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
        Set-Content -Path $failedFile -Value $remote
    }
}

function Invoke-Collection {
    Write-Log 'Collecting.'
    $run = Invoke-Child 'collect.ps1'
    if ($run.Code -ne 0) { Write-Log "Collection failed with exit code $($run.Code)." }
}

function Install-Tasks {
    $powershell = (Get-Command powershell.exe).Source
    $script = Join-Path $PSScriptRoot 'watch.ps1'

    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
    $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" `
        -LogonType Interactive -RunLevel Limited

    # A repeating trigger plus one at logon, so a reboot does not leave a gap.
    $repeat = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
        -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) `
        -RepetitionDuration (New-TimeSpan -Days 3650)
    $atLogon = New-ScheduledTaskTrigger -AtLogOn

    $deployAction = New-ScheduledTaskAction -Execute $powershell `
        -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`"" -WorkingDirectory $PSScriptRoot
    Register-ScheduledTask -TaskName $DeployTask -TaskPath $TaskPath -Action $deployAction `
        -Trigger @($repeat, $atLogon) -Settings $settings -Principal $principal -Force | Out-Null
    Write-Note "$DeployTask - every $IntervalMinutes minutes, and at logon."

    $daily = New-ScheduledTaskTrigger -Daily -At $CollectAt
    $collectAction = New-ScheduledTaskAction -Execute $powershell `
        -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`" -Collect" -WorkingDirectory $PSScriptRoot
    Register-ScheduledTask -TaskName $CollectTask -TaskPath $TaskPath -Action $collectAction `
        -Trigger $daily -Settings $settings -Principal $principal -Force | Out-Null
    Write-Note "$CollectTask - daily at $CollectAt."
}

if ($Install) {
    Write-Step 'Registering the tasks'
    try {
        Install-Tasks
    } catch {
        Write-Bad "Could not register the tasks: $($_.Exception.Message)"
        Write-Note 'Task Scheduler sometimes wants an elevated session. Right-click PowerShell,'
        Write-Note 'choose "Run as administrator", then run this again:'
        Write-Note "    cd $PSScriptRoot; .\watch.ps1 -Install"
        exit 1
    }
    Write-Step 'Done. Nothing else needs running, now or later.'
    Write-Note "Log: $LogFile"
    Write-Note 'Check what it would do right now with: .\watch.ps1 -Once'
    exit 0
}

if ($Uninstall) {
    Write-Step 'Removing the tasks'
    foreach ($name in @($DeployTask, $CollectTask)) {
        try {
            Unregister-ScheduledTask -TaskName $name -TaskPath $TaskPath -Confirm:$false
            Write-Note "removed $name"
        } catch {
            Write-Note "$name was not registered"
        }
    }
    exit 0
}

if ($Collect) {
    Invoke-Collection
    exit 0
}

# No switch: one deploy check. This is what the repeating task runs.
Invoke-DeployCheck
