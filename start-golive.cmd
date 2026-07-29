@echo off
setlocal
cd /d "%~dp0"

set "NODE_BIN=%LOCALAPPDATA%\nodejs-portable"
for /d %%D in ("%NODE_BIN%\node-*") do set "NODE_DIR=%%~fD"

if not defined NODE_DIR (
  echo Portable Node.js not found at %LOCALAPPDATA%\nodejs-portable
  echo Install Node.js LTS from https://nodejs.org then re-run this script.
  pause
  exit /b 1
)

set "PATH=%NODE_DIR%;%PATH%"
echo Using Node from %NODE_DIR%
call npm.cmd run golive
