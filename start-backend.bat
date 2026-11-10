@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"

echo ============================================
echo  PaperWorld
echo ============================================
echo.

REM ---- 1. Node.js 版本 ----
where node >nul 2>nul
if errorlevel 1 (
  echo [x] 没有找到 Node.js。
  echo     请先安装 Node.js 18 或更新版本：https://nodejs.org/
  echo     安装后重新双击本文件。
  echo.
  pause
  exit /b 1
)

for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node.split('.')[0]"') do set NODE_MAJOR=%%v
if not defined NODE_MAJOR set NODE_MAJOR=0
if %NODE_MAJOR% LSS 18 (
  echo [x] Node.js 版本过低：当前 v%NODE_MAJOR%.x，需要 18 或更新版本。
  echo     请到 https://nodejs.org/ 升级后重试。
  echo.
  pause
  exit /b 1
)

REM ---- 2. 端口占用 ----
set PORT=8080
if not "%PW_PORT%"=="" set PORT=%PW_PORT%
netstat -ano | findstr /R /C:":%PORT% .*LISTENING" >nul 2>nul
if not errorlevel 1 (
  echo [x] 端口 %PORT% 已被占用。
  echo     可能已经有一个 PaperWorld 在运行：直接打开 http://localhost:%PORT% 试试。
  echo     要换端口，先设置环境变量 PW_PORT，例如：set PW_PORT=8090
  echo.
  pause
  exit /b 1
)

echo  服务地址 : http://localhost:%PORT%/index.html
echo  模型设置 : http://localhost:%PORT%/core.html
echo.
echo  保持本窗口打开即为运行中；关闭窗口或按 Ctrl+C 停止。
echo.

REM 浏览器通常比 Node 启动慢，先打开即可正常命中服务
start "" http://localhost:%PORT%/index.html

node server/index.js
set CODE=%ERRORLEVEL%

echo.
if not "%CODE%"=="0" (
  echo [x] 服务异常退出（代码 %CODE%）。上面最后几行通常是原因。
) else (
  echo [服务已停止]
)
pause >nul
