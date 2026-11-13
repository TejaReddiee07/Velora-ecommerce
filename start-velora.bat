@echo off
setlocal EnableExtensions EnableDelayedExpansion
title VELORA - launcher
cd /d "%~dp0"
set "ROOT=%~dp0"
set "API_HEALTH=http://localhost:4000/api/health"
set "WEB_URL=http://localhost:3000"
set "ADMIN_URL=http://localhost:3000/admin/login"

echo.
echo  ==========================================================
echo     V E L O R A   -   starting your store
echo  ==========================================================
echo.

rem ---------------------------------------------------------------
rem  Step 1 - Node.js
rem ---------------------------------------------------------------
echo  [1/7] Checking Node.js ...
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [ERROR] Node.js is not installed.
  echo          Install Node.js 20 or newer from https://nodejs.org and run this file again.
  goto :fail
)
for /f "tokens=1 delims=v." %%a in ('node -v') do set "NODE_MAJOR=%%a"
if !NODE_MAJOR! LSS 20 (
  echo  [ERROR] Node.js 20 or newer is required. You have:
  node -v
  goto :fail
)
where npm >nul 2>nul
if errorlevel 1 (
  echo  [ERROR] npm was not found. Reinstall Node.js from https://nodejs.org
  goto :fail
)
for /f %%v in ('node -v') do echo        Node.js %%v found.
where curl >nul 2>nul
if errorlevel 1 set "NOCURL=1"

rem ---------------------------------------------------------------
rem  Step 2 - settings files
rem ---------------------------------------------------------------
echo  [2/7] Checking settings ...
if not exist "backend\.env" (
  copy /y "backend\.env.example" "backend\.env" >nul
  echo.
  echo  [ACTION NEEDED] backend\.env did not exist, so it was created from the example.
  echo                  Fill in MONGODB_URI, SESSION_SECRET, ADMIN_EMAIL and ADMIN_PASSWORD,
  echo                  save the file, then run start-velora.bat again.
  start "" notepad "backend\.env"
  goto :fail
)
findstr /r /c:"^MONGODB_URI=..*" "backend\.env" >nul
if errorlevel 1 (
  echo  [ERROR] MONGODB_URI is empty in backend\.env - add your MongoDB Atlas connection string.
  goto :fail
)
findstr /r /c:"^SESSION_SECRET=................................" "backend\.env" >nul
if errorlevel 1 (
  echo  [ERROR] SESSION_SECRET in backend\.env must be at least 32 characters long.
  goto :fail
)
if not exist "frontend\.env.local" (
  copy /y "frontend\.env.example" "frontend\.env.local" >nul
  echo        Created frontend\.env.local with local defaults.
)
echo        Settings OK.

rem ---------------------------------------------------------------
rem  Step 3 - close any VELORA servers still running from a previous start
rem ---------------------------------------------------------------
echo  [3/7] Closing old VELORA servers (if any) ...
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\stop-velora.ps1"
call :sleep 2
call :port_busy 4000
if not errorlevel 1 (
  echo  [ERROR] Port 4000 is being used by another program. Close it and run this file again:
  netstat -ano | findstr /r /c:":4000 .*LISTENING"
  goto :fail
)
call :port_busy 3000
if not errorlevel 1 (
  echo  [ERROR] Port 3000 is being used by another program. Close it and run this file again:
  netstat -ano | findstr /r /c:":3000 .*LISTENING"
  goto :fail
)
rem A server can still answer even when netstat no longer lists it as LISTENING.
call :probe "%API_HEALTH%"
if not errorlevel 1 (
  echo  [ERROR] An old VELORA API is still answering on port 4000.
  echo          Close any old "VELORA API" window ^(or restart the computer^) and run this file again.
  goto :fail
)
call :probe "%WEB_URL%"
if not errorlevel 1 (
  echo  [ERROR] An old VELORA storefront is still answering on port 3000.
  echo          Close any old "VELORA Storefront" window ^(or restart the computer^) and run this file again.
  goto :fail
)
echo        Ports 4000 and 3000 are free.

rem ---------------------------------------------------------------
rem  Step 4 - packages (first run only)
rem ---------------------------------------------------------------
echo  [4/7] Checking packages ...
if not exist "backend\node_modules\.bin\tsc.cmd" (
  echo        Installing API packages - first run, this can take a few minutes ...
  call npm --prefix backend install --no-audit --no-fund
  if errorlevel 1 ( echo  [ERROR] Installing API packages failed. & goto :fail )
)
if not exist "frontend\node_modules\.bin\next.cmd" (
  echo        Installing storefront packages - first run, this can take a few minutes ...
  call npm --prefix frontend install --no-audit --no-fund
  if errorlevel 1 ( echo  [ERROR] Installing storefront packages failed. & goto :fail )
)
echo        Packages OK.

rem ---------------------------------------------------------------
rem  Step 5 - API
rem ---------------------------------------------------------------
echo  [5/7] Building and starting the API ...
call npm --prefix backend run build --silent
if errorlevel 1 ( echo  [ERROR] The API failed to build - see the messages above. & goto :fail )
start "VELORA API  (keep this window open)" /D "%ROOT%backend" cmd /k "npm start"
echo        Waiting for the API to connect to MongoDB ...
echo        (the very first start also loads the demo catalogue and can take 2-4 minutes)
set /a tries=0
:wait_api
set /a tries+=1
call :probe "%API_HEALTH%"
if not errorlevel 1 goto :api_ready
if !tries! GEQ 200 (
  echo  [ERROR] The API did not start. Look at the "VELORA API" window for the reason
  echo          (usually MongoDB Atlas network access or a wrong MONGODB_URI password^).
  goto :fail
)
call :sleep 2
goto :wait_api
:api_ready
echo        API is running on http://localhost:4000

rem ---------------------------------------------------------------
rem  Step 6 - storefront + owner portal
rem ---------------------------------------------------------------
echo  [6/7] Building the storefront (about 1 minute) ...
call npm --prefix frontend run build
if errorlevel 1 ( echo  [ERROR] The storefront failed to build - see the messages above. & goto :fail )
start "VELORA Storefront  (keep this window open)" /D "%ROOT%frontend" cmd /k "npm start"
echo        Waiting for the storefront ...
set /a tries=0
:wait_web
set /a tries+=1
call :probe "%WEB_URL%"
if not errorlevel 1 goto :web_ready
if !tries! GEQ 90 (
  echo  [ERROR] The storefront did not start. Look at the "VELORA Storefront" window for the reason.
  goto :fail
)
call :sleep 2
goto :wait_web
:web_ready
rem Warm up the main pages so they open instantly.
call :probe "%WEB_URL%/" >nul
call :probe "%ADMIN_URL%" >nul
echo        Storefront is running on %WEB_URL%

rem ---------------------------------------------------------------
rem  Step 7 - open the browser
rem ---------------------------------------------------------------
echo  [7/7] Opening your browser ...
start "" "%WEB_URL%"

set "ADMIN_EMAIL="
for /f "tokens=1,* delims==" %%a in ('findstr /b /c:"ADMIN_EMAIL=" "backend\.env"') do set "ADMIN_EMAIL=%%b"

echo.
echo  ==========================================================
echo     VELORA is running
echo  ----------------------------------------------------------
echo     Storefront    %WEB_URL%
echo     Showroom      %WEB_URL%/showroom
echo     Sign in       %WEB_URL%/login  (one sign-in for everyone)
echo       - owner/admin email  -^> opens the owner portal
echo       - customer email     -^> opens My Account
echo     Owner email   !ADMIN_EMAIL!  (password: see backend\.env)
echo  ----------------------------------------------------------
echo     Keep the "VELORA API" and "VELORA Storefront" windows open.
echo     To stop everything: close them, or run stop-velora.bat
echo  ==========================================================
echo.
if not defined VELORA_NO_PAUSE (
  echo  You can close this launcher window - the store keeps running.
  pause
)
endlocal
exit /b 0

rem ===============================================================
:fail
echo.
echo  VELORA did not start. Fix the problem above and run start-velora.bat again.
echo.
if not defined VELORA_NO_PAUSE pause
endlocal
exit /b 1

rem --- helpers ----------------------------------------------------
:sleep
rem waits about %1 seconds (ping waits one second between its attempts)
set /a "_pings=%~1+1"
ping -n !_pings! 127.0.0.1 >nul 2>nul
exit /b 0

:probe
if defined NOCURL goto :probe_ps
curl -sf -o nul -m 5 "%~1" >nul 2>nul
exit /b %errorlevel%
:probe_ps
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 '%~1' | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
exit /b %errorlevel%

:port_busy
rem errorlevel 0 = something is listening on the port
netstat -ano | findstr /r /c:":%~1 .*LISTENING" >nul
exit /b %errorlevel%
