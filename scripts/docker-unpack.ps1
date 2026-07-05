# Restaurant app - unpack the exported bundle.
#
# Run via `.\unpack` (or `.\unpack.cmd`) from either the repo root or app/.
# Optional: `.\unpack -Start` also runs `docker compose up` to fully launch
#           the app afterward (equivalent to running run.cmd yourself).
# Optional: `.\unpack -Destination <path>` to control where it's extracted
# (defaults to a timestamped folder next to the zip so re-running this
# doesn't silently clobber a previous unpack you might still be using).
#
# This extracts the zip AND loads both Docker images from it (docker load),
# since "unpacking" a Docker export isn't just decompressing files -- the
# images inside the .tar files aren't usable by Docker until they're loaded
# into its local image store. Without this step you'd have unzipped files
# sitting on disk that Docker doesn't know about yet.
#
# This is for unpacking restaurant-app-export.zip on THIS machine (e.g. to
# test it, or because you're setting this machine up as the "target" of an
# export you received). On a genuinely different machine, you won't have
# this script -- just unzip the file with whatever tool that machine has
# (Windows: right-click > Extract All; Mac: double-click; Linux: `unzip`)
# and run run.cmd/run.sh directly, no PowerShell needed. This command exists
# purely as a convenience for staying inside one workflow on a machine that
# already has this repo.
#
# Every time this runs, it prints exactly what happened and what to do
# next -- same "always explain itself" pattern as startup/export.

param(
    [string]$Destination,
    [switch]$Start
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ZipFileName = "restaurant-app-export.zip"
$ZipPath = Join-Path $RepoRoot $ZipFileName
$AppImageTarName = "restaurant-app-image.tar"
$PostgresImageTarName = "postgres-image.tar"
$ComposeFileName = "docker-compose.export.yml"

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Ok {
    param([string]$Message)
    Write-Host "    [OK] $Message" -ForegroundColor Green
}

function Write-Err {
    param([string]$Message)
    Write-Host "    [FAIL] $Message" -ForegroundColor Red
}

function Write-Info {
    param([string]$Message)
    Write-Host "    $Message" -ForegroundColor Gray
}

Write-Host "=========================================" -ForegroundColor Magenta
Write-Host " Restaurant app - unpack exported bundle" -ForegroundColor Magenta
Write-Host "=========================================" -ForegroundColor Magenta

if (-not (Test-Path $ZipPath)) {
    Write-Err "$ZipFileName not found at $RepoRoot"
    Write-Info "Run .\export first to create it."
    exit 1
}

# ---------------------------------------------------------------------------
# 1. Docker present and running (needed for the "docker load" step below,
#    not just for -Start, so check this before doing any extraction work)
# ---------------------------------------------------------------------------
Write-Step "Checking Docker is installed and running..."
$dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
if (-not $dockerCmd) {
    Write-Err "Docker is not installed or not on PATH. Install Docker Desktop first: https://www.docker.com/products/docker-desktop/"
    exit 1
}
docker info 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Err "Docker is installed but not running. Start Docker Desktop and try again."
    exit 1
}
Write-Ok "Docker is installed and running."

# ---------------------------------------------------------------------------
# 2. Extract the zip
# ---------------------------------------------------------------------------
if (-not $Destination) {
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $Destination = Join-Path $RepoRoot "restaurant-app-unpacked-$timestamp"
}

Write-Step "Extracting $ZipFileName ..."
Write-Info "Source:      $ZipPath"
Write-Info "Destination: $Destination"

Expand-Archive -Path $ZipPath -DestinationPath $Destination -Force
Write-Ok "Extracted successfully."

$fileCount = (Get-ChildItem -Path $Destination -File).Count
Write-Ok "$fileCount files extracted."

# ---------------------------------------------------------------------------
# 3. Load both Docker images from the extracted .tar files
# ---------------------------------------------------------------------------
$appImageTarPath = Join-Path $Destination $AppImageTarName
$postgresImageTarPath = Join-Path $Destination $PostgresImageTarName

if (-not (Test-Path $appImageTarPath)) {
    Write-Err "$AppImageTarName not found in the extracted folder -- something's wrong with the zip contents."
    exit 1
}
if (-not (Test-Path $postgresImageTarPath)) {
    Write-Err "$PostgresImageTarName not found in the extracted folder -- something's wrong with the zip contents."
    exit 1
}

Write-Step "Loading the app image into Docker (docker load)..."
docker load -i $appImageTarPath
if ($LASTEXITCODE -ne 0) {
    Write-Err "docker load failed for $AppImageTarName. See output above."
    exit 1
}
Write-Ok "App image loaded."

Write-Step "Loading the Postgres image into Docker (docker load)..."
docker load -i $postgresImageTarPath
if ($LASTEXITCODE -ne 0) {
    Write-Err "docker load failed for $PostgresImageTarName. See output above."
    exit 1
}
Write-Ok "Postgres image loaded."

# ---------------------------------------------------------------------------
# 4. .env (SESSION_SECRET) -- same generation + validation logic as run.cmd,
#    duplicated here (not called out to a shared file) because run.cmd/run.sh
#    are meant to work standing alone on a machine with nothing else from
#    this repo -- see CLAUDE.md on why that independence matters.
# ---------------------------------------------------------------------------
$envPath = Join-Path $Destination ".env"
if (-not (Test-Path $envPath)) {
    Write-Step "Generating a fresh random SESSION_SECRET for this machine..."
    $rng = New-Object System.Security.Cryptography.RNGCryptoServiceProvider
    $bytes = New-Object byte[] 48
    $rng.GetBytes($bytes)
    $secret = [Convert]::ToBase64String($bytes) -replace '\+', '-' -replace '/', '_' -replace '=', ''

    if ([string]::IsNullOrEmpty($secret) -or $secret -match '^A+$') {
        Write-Err "Failed to generate a random SESSION_SECRET. Cannot continue safely."
        exit 1
    }

    Set-Content -Path $envPath -Value "SESSION_SECRET=$secret" -NoNewline
    Write-Ok "Wrote .env with a new SESSION_SECRET."
} else {
    Write-Ok ".env already exists in the destination, reusing it."
}

# ---------------------------------------------------------------------------
# 5. Optionally go all the way and start the stack
# ---------------------------------------------------------------------------
if ($Start) {
    Write-Step "Starting Postgres + the app (docker compose up -d, since -Start was passed)..."
    $composeFilePath = Join-Path $Destination $ComposeFileName
    Push-Location $Destination
    try {
        docker compose -f $composeFilePath up -d
        if ($LASTEXITCODE -ne 0) {
            # A partial failure here (e.g. Postgres starts fine, then the app
            # container fails because port 3000 is already taken by something
            # else -- confirmed during testing, this happens if a normal dev
            # server is already running on this same machine) leaves orphaned
            # containers/network/volume behind if not cleaned up. Tear down
            # whatever this specific run just created rather than leaving
            # debris for the user to notice and puzzle over later.
            Write-Err "docker compose up failed. See output above."
            Write-Info "Cleaning up any containers/network/volume this run just created..."
            # Deliberately NOT redirecting stderr here (e.g. "2>&1 | Out-Null")
            # -- on Windows PowerShell 5.1, redirecting a native command's
            # stderr wraps each line in a NativeCommandError and prints it
            # even when piped to Out-Null, which looked like the cleanup
            # itself had failed when it hadn't (confirmed during testing).
            # docker compose's own progress output here is genuinely useful
            # anyway, so just let it print normally.
            docker compose -f $composeFilePath down -v
            Write-Info "A common cause: something else on this machine (e.g. the normal dev server) is already using port 3000 or 5432."
            Write-Info "The extracted files are still at $Destination if you want to edit docker-compose.export.yml's ports and try again."
            exit 1
        }
    } finally {
        Pop-Location
    }
    Write-Ok "Stack started."
}

# ---------------------------------------------------------------------------
# 6. Always print what happened and what to do next
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "=========================================" -ForegroundColor Magenta
Write-Host " Done. Here's what happened and how to use it:" -ForegroundColor Magenta
Write-Host "=========================================" -ForegroundColor Magenta
Write-Host ""
Write-Host "  Unpacked to:" -ForegroundColor Yellow
Write-Host "    $Destination" -ForegroundColor White
Write-Host ""
Write-Host "  Both Docker images (app + Postgres) are now loaded into Docker on this" -ForegroundColor White
Write-Host "  machine, ready to run -- that part is done, no internet was used for it." -ForegroundColor White
Write-Host ""

if ($Start) {
    Write-Host "  The app is starting now. Wait about 10-20 seconds, then visit:" -ForegroundColor White
    Write-Host "    http://localhost:3000" -ForegroundColor Green
} else {
    Write-Host "  To actually start the app running:" -ForegroundColor White
    Write-Host "    cd `"$Destination`"" -ForegroundColor Green
    Write-Host "    docker compose -f $ComposeFileName up -d" -ForegroundColor Green
    Write-Host "    (or just re-run: .\unpack -Start)" -ForegroundColor Gray
}
Write-Host ""
Write-Host "  Useful commands afterward (run from that folder):" -ForegroundColor White
Write-Host "    docker compose -f $ComposeFileName ps        (check status)" -ForegroundColor Gray
Write-Host "    docker compose -f $ComposeFileName logs -f    (watch logs)" -ForegroundColor Gray
Write-Host "    docker compose -f $ComposeFileName down       (stop everything)" -ForegroundColor Gray
Write-Host ""
Write-Host "  This whole command is a convenience for THIS machine only (it needs" -ForegroundColor Gray
Write-Host "  PowerShell + this repo's scripts folder). On a genuinely different" -ForegroundColor Gray
Write-Host "  machine, there's no unpack command available -- just unzip" -ForegroundColor Gray
Write-Host "  restaurant-app-export.zip normally and run run.cmd / run.sh, which do" -ForegroundColor Gray
Write-Host "  the same docker load + docker compose up steps on their own." -ForegroundColor Gray
Write-Host ""
