@echo off
cd /d "%~dp0"

if not exist node_modules (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 goto error
)

echo Starting VA Spec Maker at http://localhost:5173
start "" /b cmd /c "timeout /t 4 >nul & start http://localhost:5173"
call npm run dev
goto :eof

:error
echo Dependency install failed.
pause
