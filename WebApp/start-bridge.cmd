@echo off
cd /d "%~dp0"
"C:\Program Files\nodejs\npm.cmd" run bcf:serve >> "%~dp0bridge.log" 2>&1
