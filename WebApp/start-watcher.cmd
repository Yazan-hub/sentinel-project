@echo off
cd /d "%~dp0"
"C:\Program Files\nodejs\npm.cmd" run bridge:watch >> "%~dp0watcher.log" 2>&1
