@echo off
setlocal

cd /d "%~dp0"

npm.cmd run dev:all
if errorlevel 1 (
  echo.
  echo VPN IP Guard failed to start. Error code: %ERRORLEVEL%
  pause
)
