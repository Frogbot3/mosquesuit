@echo off
setlocal
cd /d "%~dp0"
node --version >nul 2>&1
if errorlevel 1 (
  echo Node.js 24 is required. See README.md for installation instructions.
  pause
  exit /b 1
)
if not exist "node_modules\electron\dist\electron.exe" (
  echo Dependencies are missing. Run npm.cmd ci from this folder first.
  pause
  exit /b 1
)
if not exist "dist-electron\main.cjs" (
  call npm.cmd run build
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
call npm.cmd run demo:finance
if errorlevel 1 pause
