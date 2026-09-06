@echo off
REM Open the two windows the testing loop needs, at whatever folder this file
REM sits in. Double-click it; there is nothing to configure.
REM
REM   Dev window     - runs npm run dev, serving the site on :3001. No prompt:
REM                    it streams compile output until you press Ctrl+C.
REM   Command window - a prompt at the repository, already pulled up to date.
REM
REM Neither window touches the deployed container on :3000. Deploying is still
REM .\update.ps1, run by hand from the command window.

set "REPO=%~dp0"

start "Halls dev" powershell.exe -NoExit -Command "Set-Location -LiteralPath '%REPO%'; Write-Host 'Dev server: http://localhost:3001  (Ctrl+C to stop)' -ForegroundColor Cyan; npm run dev"

start "Halls commands" powershell.exe -NoExit -Command "Set-Location -LiteralPath '%REPO%'; git pull; git log -1 --oneline"
