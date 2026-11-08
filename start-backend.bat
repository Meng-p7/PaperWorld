@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [x] Node.js not found.
  echo     Install Node 18 or newer from https://nodejs.org/ then run this again.
  pause
  exit /b 1
)

echo ============================================
echo  PaperWorld
echo  Opening http://localhost:8080/index.html
echo  Keep this window open while you use the site.
echo  Close it (or press Ctrl+C) to stop the service.
echo ============================================
echo.

REM Open the browser first: Node starts faster than a cold browser launch,
REM so the page will normally find the service already listening.
start "" http://localhost:8080/index.html

node server/index.js

echo.
echo [service stopped] press any key to close.
pause >nul
