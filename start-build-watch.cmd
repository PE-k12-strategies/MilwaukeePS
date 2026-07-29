@echo off
setlocal
cd /d "%~dp0"

set "NODE_BIN=%LOCALAPPDATA%\nodejs-portable"
for /d %%D in ("%NODE_BIN%\node-*") do set "NODE_DIR=%%~fD"

if not defined NODE_DIR (
  where node >nul 2>&1
  if errorlevel 1 (
    echo Node.js not found. Install from https://nodejs.org or restore portable Node.
    pause
    exit /b 1
  )
) else (
  set "PATH=%NODE_DIR%;%PATH%"
)

echo Building Live Server bundle...
call npm.cmd run build
if errorlevel 1 (
  echo Build failed.
  pause
  exit /b 1
)
echo.
echo Done. Open index.html with Live Server.
echo Optional: leave this watching for source edits...
call npm.cmd run build:watch
