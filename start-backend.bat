@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title PaperWorld

echo ============================================
echo   PaperWorld
echo ============================================
echo.

rem ---- 0. files present ----
if not exist "server\index.js" (
  echo [x] server\index.js not found.
  echo     Unzip or clone the whole project first.
  echo     Current folder: %CD%
  echo.
  pause
  exit /b 1
)

rem ---- 1. Node.js 18+ ----
where node >nul 2>nul
if errorlevel 1 goto NO_NODE

set "NODE_MAJOR="
for /f "tokens=1 delims=." %%v in ('node -v') do set "NODE_MAJOR=%%v"
if defined NODE_MAJOR set "NODE_MAJOR=%NODE_MAJOR:v=%"
if not defined NODE_MAJOR set "NODE_MAJOR=0"
if %NODE_MAJOR% LSS 18 goto OLD_NODE

rem ---- 2. port ----
set "PORT=8080"
if not "%PW_PORT%"=="" set "PORT=%PW_PORT%"
set "BUSY="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do if not defined BUSY set "BUSY=%%p"
if not defined BUSY goto RUN

echo [!] Port %PORT% is already in use by PID %BUSY%.
echo.
echo     If that is a PaperWorld you started earlier, just open:
echo       http://localhost:%PORT%/index.html
echo.
echo     Opening it for you now. If the page does not load, another
echo     program owns the port. Close it, or run this line first and
echo     then double-click this file again:
echo       set PW_PORT=8090
echo.
start "" http://localhost:%PORT%/index.html
pause
exit /b 0

:RUN
echo   Site : http://localhost:%PORT%/index.html
echo   Setup: http://localhost:%PORT%/core.html
echo.
echo   Keep this window open while you use the site.
echo   Close it or press Ctrl+C to stop.
echo.
start "" http://localhost:%PORT%/index.html

node server/index.js
set "CODE=%ERRORLEVEL%"
echo.
if not "%CODE%"=="0" (
  echo [x] Service exited with code %CODE%. See the lines above.
) else (
  echo [stopped]
)
pause >nul
exit /b %CODE%

:NO_NODE
echo [x] Node.js not found.
echo.
echo     Install Node.js 18 or newer from https://nodejs.org/
echo     then double-click this file again.
echo.
pause
exit /b 1

:OLD_NODE
echo [x] Node.js is too old: v%NODE_MAJOR%.x found, 18+ required.
echo.
echo     Upgrade from https://nodejs.org/ then double-click this file again.
echo.
pause
exit /b 1
