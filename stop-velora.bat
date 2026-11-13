@echo off
title VELORA - stop
cd /d "%~dp0"
echo.
echo  Stopping VELORA (API and storefront) ...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-velora.ps1"
echo  Done. Run start-velora.bat to start the store again.
echo.
if not defined VELORA_NO_PAUSE pause
