@echo off
REM Lets you type just "export" (no ".\", no ".ps1") from the repo root,
REM even on a machine where PowerShell's execution policy would otherwise
REM block running .ps1 scripts. -ExecutionPolicy Bypass only applies to
REM this one launched process, it does not change any system setting.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\docker-export.ps1"
