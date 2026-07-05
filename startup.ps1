# Thin wrapper so you can run `.\startup` from the repo root.
# The real logic lives in scripts/startup.ps1 (kept in one place so the
# root and app/ wrappers can't drift out of sync with each other).
& (Join-Path $PSScriptRoot "scripts\startup.ps1")
