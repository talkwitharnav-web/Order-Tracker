# Thin wrapper so you can run `.\export` from the app/ folder too.
# The real logic lives in ../scripts/docker-export.ps1.
& (Join-Path $PSScriptRoot "..\scripts\docker-export.ps1")
