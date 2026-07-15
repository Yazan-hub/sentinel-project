@echo off
REM ============================================================
REM  Sentinel Bridge - start the outbox watcher.
REM  Watches %APPDATA%\Sentinel\outbox and uploads exported IFCs
REM  to That Open Platform. Double-click to run, or let
REM  install-autostart.cmd launch it on login.
REM ============================================================
title Sentinel Bridge - outbox watcher
cd /d "%~dp0.."
where node >nul 2>nul || (echo [ERROR] Node.js not found on PATH. & pause & exit /b 1)
echo Starting Sentinel Bridge watcher... (close this window to stop)
node bridge\watch-outbox.mjs
echo.
echo Watcher stopped.
pause >nul
