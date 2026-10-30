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
echo Opening Mosque Suite Phase 5 - fictional integration simulation...
echo No real WhatsApp messages or money are enabled.
call npm.cmd run demo:integrations
if errorlevel 1 (
  echo.
  echo Mosque Suite could not start. Read the error above.
  pause
)
endlocal
