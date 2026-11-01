@echo off
setlocal
cd /d "%~dp0"
node --version >nul 2>&1
if errorlevel 1 (
  echo Install Node.js 24.18 or newer in the 24.x series. See docs\PHASE-7-PILOT.md.
  pause
  exit /b 1
)
if not exist "node_modules\electron\dist\electron.exe" (
  echo Run npm.cmd ci in this folder before the first offline session.
  pause
  exit /b 1
)
if not exist "pilot-data\manifest.json" (
  echo The fictional pilot dataset is missing. Run npm.cmd run qa:pilot-data.
  pause
  exit /b 1
)
if not exist "dist-electron\main.cjs" (
  call npm.cmd run build
  if errorlevel 1 exit /b 1
)
echo Opening the fictional Phase 7 pilot. Create your own administrator.
call npm.cmd run demo:pilot
if errorlevel 1 pause
endlocal
