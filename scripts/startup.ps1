# Restaurant app startup script.
#
# Run this from EITHER the repo root or the app/ folder by typing `startup`
# (a thin wrapper in both locations forwards here). It never hardcodes a
# machine-specific path -- everything is resolved relative to this script's
# own location ($PSScriptRoot), so it works the same on any machine the repo
# is cloned/copied to.
#
# What it does, in order, being verbose about every step:
#   1. Check Node.js is installed (and print the version).
#   2. Check npm is installed.
#   3. Check Docker Desktop is installed.
#   4. Check Docker Desktop is actually RUNNING (it does not auto-start).
#   5. Check/create app/.env.local (copies from .env.example, generates a
#      real random SESSION_SECRET automatically if missing).
#   6. Check/install npm dependencies in app/ (npm ci if a lockfile exists
#      and node_modules is missing/stale, else npm install).
#   7. Start the Postgres container via docker compose.
#   8. Start the dev server (node server.js).

$ErrorActionPreference = "Stop"

# Resolve paths relative to THIS script, not the current working directory,
# so it doesn't matter whether you're in repo root or app/ when you run it.
$RepoRoot = Split-Path -Parent $PSScriptRoot
$AppDir = Join-Path $RepoRoot "app"

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Ok {
    param([string]$Message)
    Write-Host "    [OK] $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host "    [!] $Message" -ForegroundColor Yellow
}

function Write-Err {
    param([string]$Message)
    Write-Host "    [FAIL] $Message" -ForegroundColor Red
}

function Write-Info {
    param([string]$Message)
    Write-Host "    $Message" -ForegroundColor Gray
}

# Generates a random 48-byte, base64url-encoded secret. Uses
# RNGCryptoServiceProvider rather than [RandomNumberGenerator]::Fill() --
# the latter is a .NET 6+-only API that fails silently as "method not
# found" on Windows PowerShell 5.1 (which ships by default on many Windows
# installs), and that failure was confirmed during testing to leave an
# all-zero-byte (entirely predictable) value that would have been written
# out as if it were a real random secret. RNGCryptoServiceProvider works on
# both PS 5.1 and 7+. Also validates the result before returning it, so a
# bad secret fails loudly instead of silently continuing.
function New-SessionSecret {
    $rng = New-Object System.Security.Cryptography.RNGCryptoServiceProvider
    $bytes = New-Object byte[] 48
    $rng.GetBytes($bytes)
    $secret = [Convert]::ToBase64String($bytes) -replace '\+', '-' -replace '/', '_' -replace '=', ''

    if ([string]::IsNullOrEmpty($secret) -or $secret -match '^A+$') {
        Write-Err "Failed to generate a random SESSION_SECRET. Cannot continue safely."
        exit 1
    }
    return $secret
}

Write-Host "=========================================" -ForegroundColor Magenta
Write-Host " Restaurant app - startup dependency check" -ForegroundColor Magenta
Write-Host "=========================================" -ForegroundColor Magenta
Write-Info "Repo root: $RepoRoot"
Write-Info "App dir:   $AppDir"

# ---------------------------------------------------------------------------
# 1. Node.js
# ---------------------------------------------------------------------------
Write-Step "Checking for Node.js..."
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Err "Node.js is not installed or not on PATH."
    Write-Info "This script cannot install Node.js for you automatically (it's not a package, it's a runtime installer)."
    Write-Info "Install it from https://nodejs.org (LTS version) and re-run 'startup'."
    exit 1
}
$nodeVersion = (node --version).Trim()
Write-Ok "Node.js found: $nodeVersion (at $($nodeCmd.Source))"

$nodeMajor = [int]($nodeVersion.TrimStart("v").Split(".")[0])
if ($nodeMajor -lt 18) {
    Write-Warn "Node.js $nodeVersion is older than the recommended minimum (v18+). Things may not work correctly."
} else {
    Write-Ok "Node.js version is recent enough (v18+)."
}

# ---------------------------------------------------------------------------
# 2. npm
# ---------------------------------------------------------------------------
Write-Step "Checking for npm..."
$npmCmd = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npmCmd) {
    Write-Err "npm is not installed or not on PATH (it normally ships with Node.js)."
    Write-Info "Reinstall Node.js from https://nodejs.org, which includes npm, then re-run 'startup'."
    exit 1
}
$npmVersion = (npm --version).Trim()
Write-Ok "npm found: v$npmVersion"

# ---------------------------------------------------------------------------
# 3. Docker Desktop installed
# ---------------------------------------------------------------------------
Write-Step "Checking for Docker..."
$dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
if (-not $dockerCmd) {
    Write-Err "Docker is not installed or not on PATH."
    Write-Info "This app needs Docker Desktop to run its Postgres database locally."
    Write-Info "Download and install it from https://www.docker.com/products/docker-desktop/"
    Write-Info "Then start Docker Desktop once (it needs to be running, not just installed) and re-run 'startup'."
    exit 1
}
$dockerVersion = (docker --version).Trim()
Write-Ok "Docker found: $dockerVersion"

# ---------------------------------------------------------------------------
# 4. Docker Desktop actually running
# ---------------------------------------------------------------------------
Write-Step "Checking Docker Desktop is running..."
$dockerRunning = $false
try {
    docker info 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { $dockerRunning = $true }
} catch {
    $dockerRunning = $false
}

if (-not $dockerRunning) {
    Write-Err "Docker is installed but Docker Desktop does not appear to be running."
    Write-Info "This script will NOT try to launch Docker Desktop for you automatically --"
    Write-Info "please start Docker Desktop yourself (it can take 10-30s to finish starting up),"
    Write-Info "then re-run 'startup'."
    exit 1
}
Write-Ok "Docker Desktop is running."

# ---------------------------------------------------------------------------
# 5. app/.env.local
# ---------------------------------------------------------------------------
Write-Step "Checking app/.env.local..."
$envLocalPath = Join-Path $AppDir ".env.local"
$envExamplePath = Join-Path $AppDir ".env.example"

if (Test-Path $envLocalPath) {
    Write-Ok ".env.local already exists."
    $envContent = Get-Content $envLocalPath -Raw
    if ($envContent -notmatch "SESSION_SECRET=\S") {
        Write-Warn "SESSION_SECRET is missing or empty in .env.local -- generating one now."
        $secret = New-SessionSecret
        if ($envContent -match "SESSION_SECRET=") {
            $newContent = $envContent -replace "SESSION_SECRET=.*", "SESSION_SECRET=$secret"
        } else {
            $newContent = $envContent.TrimEnd() + "`nSESSION_SECRET=$secret`n"
        }
        Set-Content -Path $envLocalPath -Value $newContent -NoNewline
        Write-Ok "Generated a new random SESSION_SECRET and saved it to .env.local."
    } else {
        Write-Ok "SESSION_SECRET is already set."
    }
} else {
    Write-Warn ".env.local does not exist yet -- creating it from .env.example."
    if (-not (Test-Path $envExamplePath)) {
        Write-Err "app/.env.example is missing too -- cannot create .env.local automatically."
        exit 1
    }
    Copy-Item $envExamplePath $envLocalPath
    Write-Ok "Copied .env.example -> .env.local"

    Write-Info "Generating a random SESSION_SECRET (this signs login sessions -- must be unique per install)..."
    $secret = New-SessionSecret
    $envContent = Get-Content $envLocalPath -Raw
    if ($envContent -match "SESSION_SECRET=") {
        $newContent = $envContent -replace "SESSION_SECRET=.*", "SESSION_SECRET=$secret"
    } else {
        $newContent = $envContent.TrimEnd() + "`nSESSION_SECRET=$secret`n"
    }
    Set-Content -Path $envLocalPath -Value $newContent -NoNewline
    Write-Ok "SESSION_SECRET generated and saved."
}

# ---------------------------------------------------------------------------
# 6. npm dependencies
# ---------------------------------------------------------------------------
Write-Step "Checking npm dependencies in app/..."
$nodeModulesPath = Join-Path $AppDir "node_modules"
$packageLockPath = Join-Path $AppDir "package-lock.json"
$packageJsonPath = Join-Path $AppDir "package.json"

$needsInstall = $false
if (-not (Test-Path $nodeModulesPath)) {
    Write-Warn "node_modules does not exist yet."
    $needsInstall = $true
} else {
    # A timestamp comparison alone isn't reliable enough -- node_modules can
    # exist and look "fresh" while a specific package inside it is actually
    # missing or half-installed (this happened during testing: node_modules
    # existed, but node_modules/next/package.json was missing entirely, and
    # a plain folder-timestamp check would have said "looks fine"). Actually
    # verify every declared dependency resolves.
    $pkgJson = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
    $allDeps = @()
    if ($pkgJson.dependencies) { $allDeps += $pkgJson.dependencies.PSObject.Properties.Name }
    if ($pkgJson.devDependencies) { $allDeps += $pkgJson.devDependencies.PSObject.Properties.Name }

    $missingDeps = @()
    foreach ($dep in $allDeps) {
        $depPkgJson = Join-Path $nodeModulesPath (Join-Path $dep "package.json")
        if (-not (Test-Path $depPkgJson)) {
            $missingDeps += $dep
        }
    }

    if ($missingDeps.Count -gt 0) {
        Write-Warn "node_modules exists but $($missingDeps.Count) declared package(s) are missing/incomplete: $($missingDeps -join ', ')"
        $needsInstall = $true
    } else {
        Write-Ok "node_modules exists and all $($allDeps.Count) declared dependencies resolve correctly."
    }
}

if ($needsInstall) {
    Write-Info "Installing npm dependencies (this can take a minute or two)..."
    Push-Location $AppDir
    try {
        if (Test-Path $packageLockPath) {
            Write-Info "Running: npm ci"
            npm ci
        } else {
            Write-Info "Running: npm install"
            npm install
        }
        if ($LASTEXITCODE -ne 0) {
            throw "npm install failed with exit code $LASTEXITCODE"
        }
        Write-Ok "Dependencies installed successfully."
    } finally {
        Pop-Location
    }
}

# ---------------------------------------------------------------------------
# 7. Start Postgres via docker compose
# ---------------------------------------------------------------------------
Write-Step "Starting Postgres (docker compose up -d)..."
$composeFile = Join-Path $RepoRoot "docker-compose.yml"
if (-not (Test-Path $composeFile)) {
    Write-Err "docker-compose.yml not found at $composeFile"
    exit 1
}
docker compose -f $composeFile up -d
if ($LASTEXITCODE -ne 0) {
    Write-Err "docker compose up failed. See output above."
    exit 1
}
Write-Ok "Postgres container is up (or was already running)."

Write-Info "Waiting for Postgres to report healthy..."
$maxWaitSeconds = 30
$waited = 0
$healthy = $false
while ($waited -lt $maxWaitSeconds) {
    $status = docker compose -f $composeFile ps --format json 2>$null
    if ($status -match '"Health":"healthy"') {
        $healthy = $true
        break
    }
    Start-Sleep -Seconds 2
    $waited += 2
}
if ($healthy) {
    Write-Ok "Postgres is healthy."
} else {
    Write-Warn "Postgres did not report healthy within $maxWaitSeconds seconds -- it may still be starting. Continuing anyway."
}

# ---------------------------------------------------------------------------
# 8. Start the dev server
# ---------------------------------------------------------------------------
Write-Step "All checks passed. Starting the dev server..."
Write-Info "Running: node server.js  (from $AppDir)"
Write-Info "Press Ctrl+C to stop the server."
Write-Host ""

Push-Location $AppDir
try {
    node server.js
} finally {
    Pop-Location
}
