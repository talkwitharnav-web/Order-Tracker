# Thin wrapper so you can run `.\unpack` (with any of its args, e.g. -Start)
# from the app/ folder too. The real logic lives in ../scripts/docker-unpack.ps1.
param(
    [string]$Destination,
    [switch]$Start
)
& (Join-Path $PSScriptRoot "..\scripts\docker-unpack.ps1") -Destination $Destination -Start:$Start
