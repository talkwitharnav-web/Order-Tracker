# Restaurant app - full-stack Docker export script.
#
# Run via `.\export` (or `.\export.cmd`) from either the repo root or app/.
#
# Builds a Docker image of the app, then assembles a self-contained,
# portable bundle (the app image + Postgres compose config + one-click
# launcher scripts + a README) into a single .zip at the repo root. Copy
# that .zip to ANY machine with Docker installed and running one launcher
# script brings up the whole app -- website AND database -- with no need
# for this source repo, Node.js, or a Docker registry on that machine.
#
# Every time this runs, it prints where the bundle was saved and exactly
# how to use it -- on purpose, so you never have to hunt down these
# instructions later.

$ErrorActionPreference = "Stop"

# Resolve paths relative to THIS script, never hardcoded, so this works the
# same regardless of which machine/user account the repo lives under.
$RepoRoot = Split-Path -Parent $PSScriptRoot
$AppDir = Join-Path $RepoRoot "app"
$DockerfilePath = Join-Path $AppDir "Dockerfile"
$TemplatesDir = Join-Path $PSScriptRoot "export-templates"

$ImageName = "restaurant-app"
$ImageTag = "latest"
$FullImageRef = "${ImageName}:${ImageTag}"

$BundleFolderName = "restaurant-app-export"
$BundleDir = Join-Path $RepoRoot $BundleFolderName
$ZipFileName = "restaurant-app-export.zip"
$ZipPath = Join-Path $RepoRoot $ZipFileName
$ImageTarName = "restaurant-app-image.tar"

# docker-compose.export.yml references postgres:16 by tag but does not build
# it -- Docker will silently pull it from Docker Hub the first time the
# compose stack starts if it isn't already cached locally. That's a real gap
# against "just Docker, no internet needed" on a genuinely fresh machine, so
# it gets saved into the bundle too, exactly like the app image.
$PostgresImageRef = "postgres:16"
$PostgresTarName = "postgres-image.tar"

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
Write-Host " Restaurant app - full-stack Docker export" -ForegroundColor Magenta
Write-Host "=========================================" -ForegroundColor Magenta
Write-Info "Repo root: $RepoRoot"
Write-Info "App dir:   $AppDir"

# ---------------------------------------------------------------------------
# 1. Docker present and running
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

if (-not (Test-Path $DockerfilePath)) {
    Write-Err "No Dockerfile found at $DockerfilePath -- cannot build an image."
    exit 1
}

# ---------------------------------------------------------------------------
# 2. Build the image
# ---------------------------------------------------------------------------
Write-Step "Building Docker image '$FullImageRef' from $AppDir ..."
Write-Info "This runs 'npm ci' and 'npm run build' INSIDE the container, so it doesn't"
Write-Info "matter whether your local node_modules/.next are up to date -- the image"
Write-Info "is always built fresh from source."
Write-Host ""

docker build -t $FullImageRef -f $DockerfilePath $AppDir
if ($LASTEXITCODE -ne 0) {
    Write-Err "Docker build failed. See output above for details."
    exit 1
}
Write-Ok "Image built successfully: $FullImageRef"

# ---------------------------------------------------------------------------
# 3. Assemble the bundle folder
# ---------------------------------------------------------------------------
Write-Step "Assembling the export bundle..."

if (Test-Path $BundleDir) {
    Write-Info "Removing previous bundle folder from an earlier export..."
    Remove-Item -Recurse -Force $BundleDir
}
New-Item -ItemType Directory -Path $BundleDir | Out-Null

$imageTarPath = Join-Path $BundleDir $ImageTarName
Write-Info "Saving image to $ImageTarName (this can take a little while)..."
docker save -o $imageTarPath $FullImageRef
if ($LASTEXITCODE -ne 0) {
    Write-Err "docker save failed. See output above for details."
    exit 1
}
$imageSizeMB = [math]::Round((Get-Item $imageTarPath).Length / 1MB, 1)
Write-Ok "Image saved ($imageSizeMB MB)."

Write-Step "Making sure the Postgres image is available locally..."
docker image inspect $PostgresImageRef 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Info "$PostgresImageRef not found locally -- pulling it now (one-time, needs internet on THIS machine only)..."
    docker pull $PostgresImageRef
    if ($LASTEXITCODE -ne 0) {
        Write-Err "docker pull $PostgresImageRef failed. See output above for details."
        exit 1
    }
} else {
    Write-Ok "$PostgresImageRef already present locally."
}

$postgresTarPath = Join-Path $BundleDir $PostgresTarName
Write-Info "Saving $PostgresImageRef to $PostgresTarName so the exported bundle needs no internet access on the OTHER machine..."
docker save -o $postgresTarPath $PostgresImageRef
if ($LASTEXITCODE -ne 0) {
    Write-Err "docker save failed for $PostgresImageRef. See output above for details."
    exit 1
}
$postgresSizeMB = [math]::Round((Get-Item $postgresTarPath).Length / 1MB, 1)
Write-Ok "Postgres image saved ($postgresSizeMB MB)."

Write-Info "Copying compose config, launcher scripts, and README into the bundle..."
Copy-Item (Join-Path $TemplatesDir "docker-compose.export.yml") $BundleDir
Copy-Item (Join-Path $TemplatesDir "run.cmd") $BundleDir
Copy-Item (Join-Path $TemplatesDir "run.sh") $BundleDir
Copy-Item (Join-Path $TemplatesDir "README.txt") $BundleDir
Write-Ok "Bundle folder assembled at $BundleDir"

# ---------------------------------------------------------------------------
# 4. Zip it up
# ---------------------------------------------------------------------------
Write-Step "Zipping the bundle..."
if (Test-Path $ZipPath) {
    Remove-Item -Force $ZipPath
}
Compress-Archive -Path (Join-Path $BundleDir "*") -DestinationPath $ZipPath
$zipSizeMB = [math]::Round((Get-Item $ZipPath).Length / 1MB, 1)
Write-Ok "Zipped: $ZipPath ($zipSizeMB MB)"

# ---------------------------------------------------------------------------
# 5. Always print usage instructions, every run.
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "=========================================" -ForegroundColor Magenta
Write-Host " Done. Here's what happened and how to use it:" -ForegroundColor Magenta
Write-Host "=========================================" -ForegroundColor Magenta
Write-Host ""
Write-Host "  Saved here:" -ForegroundColor Yellow
Write-Host "    $ZipPath" -ForegroundColor White
Write-Host "    ($zipSizeMB MB -- a zipped copy of everything needed)" -ForegroundColor Gray
Write-Host ""
Write-Host "    An unzipped copy is also left at:" -ForegroundColor Gray
Write-Host "    $BundleDir" -ForegroundColor Gray
Write-Host ""
Write-Host "  This ONE zip file is everything needed to run the entire app -- the" -ForegroundColor White
Write-Host "  website AND its database -- on any other machine that has Docker" -ForegroundColor White
Write-Host "  installed. That machine does NOT need this source code repo, Node.js," -ForegroundColor White
Write-Host "  a Docker Hub / registry account, OR an internet connection -- both the" -ForegroundColor White
Write-Host "  app image and the Postgres image are bundled in the zip, so nothing gets" -ForegroundColor White
Write-Host "  pulled from the internet on the other machine." -ForegroundColor White
Write-Host ""
Write-Host "  --- On the OTHER machine ---" -ForegroundColor Yellow
Write-Host ""
Write-Host "  1. Copy $ZipFileName over (USB drive, network share, cloud upload --" -ForegroundColor White
Write-Host "     however you'd normally move a file) and unzip it anywhere." -ForegroundColor White
Write-Host ""
Write-Host "  2. Make sure Docker Desktop is installed and running on that machine." -ForegroundColor White
Write-Host ""
Write-Host "  3. Windows: double-click run.cmd" -ForegroundColor White
Write-Host "     Mac/Linux: open a terminal in that folder and run:  ./run.sh" -ForegroundColor White
Write-Host ""
Write-Host "  4. Wait about 10-20 seconds, then visit http://localhost:3000" -ForegroundColor White
Write-Host ""
Write-Host "  The launcher script handles everything else automatically: it generates" -ForegroundColor White
Write-Host "  a fresh random SESSION_SECRET for that machine, loads the app image into" -ForegroundColor White
Write-Host "  Docker, and starts Postgres + the app together (the app waits for the" -ForegroundColor White
Write-Host "  database to be healthy before it starts, so there's no manual ordering" -ForegroundColor White
Write-Host "  to get right)." -ForegroundColor White
Write-Host ""
Write-Host "  Full details are also in README.txt inside the bundle." -ForegroundColor Gray
Write-Host ""
Write-Host "  --- To re-export later ---" -ForegroundColor Yellow
Write-Host "     Just re-run this export command -- it always rebuilds the image fresh" -ForegroundColor White
Write-Host "     from current source and overwrites the old zip/folder." -ForegroundColor White
Write-Host ""
