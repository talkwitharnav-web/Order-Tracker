@echo off
REM Lets you type just "unpack" (no ".\", no ".ps1") from the app/ folder,
REM even on a machine where PowerShell's execution policy would otherwise
REM block running .ps1 scripts. -ExecutionPolicy Bypass only applies to
REM this one launched process, it does not change any system setting.
REM Any arguments (e.g. -Start) are forwarded as-is.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\scripts\docker-unpack.ps1" %*
