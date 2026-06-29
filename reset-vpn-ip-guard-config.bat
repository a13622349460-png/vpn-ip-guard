@echo off
setlocal

cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\reset-local-config.ps1"
if errorlevel 1 (
  echo.
  echo VPN IP Guard local config reset failed. Error code: %ERRORLEVEL%
  pause
  exit /b %ERRORLEVEL%
)

pause
