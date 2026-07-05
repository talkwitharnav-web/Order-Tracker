@echo off
REM Restaurant app - run this exported bundle.
REM Works from any location this bundle is unzipped to on any machine that
REM has Docker installed and running -- nothing here is hardcoded to a
REM specific folder or user account.
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo =========================================
echo  Restaurant app - starting from exported bundle
echo =========================================
echo.

where docker >nul 2>nul
if errorlevel 1 (
    echo [FAIL] Docker is not installed or not on PATH.
    echo        Install Docker Desktop first: https://www.docker.com/products/docker-desktop/
    exit /b 1
)

docker info >nul 2>nul
if errorlevel 1 (
    echo [FAIL] Docker is installed but not running.
    echo        Start Docker Desktop, wait for it to finish starting, then re-run this.
    exit /b 1
)
echo [OK] Docker is installed and running.
echo.

if not exist ".env" (
    echo [!] .env not found -- generating a fresh random SESSION_SECRET for this machine.
    REM Uses PowerShell (present on every supported Windows version) rather
    REM than Node, since a machine running this bundle is only guaranteed to
    REM have Docker installed -- not Node. RNGCryptoServiceProvider is used
    REM instead of RandomNumberGenerator::Fill because the latter is a
    REM .NET 6+ only API and silently fails as a "method not found" error on
    REM the Windows PowerShell 5.1 that ships by default on many Windows
    REM installs -- that failure was caught during testing, and it left an
    REM all-zero-byte (i.e. entirely predictable) value in SECRET, which
    REM would have been silently written out as a "random" secret. Also
    REM added the length/pattern check below so this can never happen again
    REM silently -- a bad secret now stops the script instead of continuing.
    for /f "delims=" %%s in ('powershell -NoProfile -Command "$rng=New-Object System.Security.Cryptography.RNGCryptoServiceProvider; $b=New-Object byte[] 48; $rng.GetBytes($b); [Convert]::ToBase64String($b) -replace '\+','-' -replace '/','_' -replace '=',''"') do set SECRET=%%s

    if "!SECRET!"=="" (
        echo [FAIL] Failed to generate a random SESSION_SECRET ^(empty result^). Cannot continue safely.
        exit /b 1
    )
    echo !SECRET! | findstr /r "^AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA$" >nul
    if not errorlevel 1 (
        echo [FAIL] Generated SESSION_SECRET looks like all-zero bytes, not real randomness. Cannot continue safely.
        exit /b 1
    )

    echo SESSION_SECRET=!SECRET!> .env
    echo [OK] Wrote .env with a new SESSION_SECRET.
) else (
    echo [OK] .env already exists, reusing it.
)
echo.

echo ==^> Loading the app image (docker load)...
docker load -i restaurant-app-image.tar
if errorlevel 1 (
    echo [FAIL] docker load failed. Is restaurant-app-image.tar in this same folder?
    exit /b 1
)
echo.

echo ==^> Loading the Postgres image (docker load)...
REM Bundled alongside the app image specifically so this whole launch needs
REM zero internet access -- without this, `docker compose up` would try to
REM pull postgres:16 from Docker Hub on a machine that's never run it before.
docker load -i postgres-image.tar
if errorlevel 1 (
    echo [FAIL] docker load failed. Is postgres-image.tar in this same folder?
    exit /b 1
)
echo.

echo ==^> Starting Postgres + the app (docker compose up -d)...
docker compose -f docker-compose.export.yml up -d
if errorlevel 1 (
    echo [FAIL] docker compose up failed. See output above.
    exit /b 1
)
echo.

echo =========================================
echo  Done. The app should be starting up now.
echo =========================================
echo.
echo   Visit http://localhost:3000 in a browser (give it 10-20 seconds to be ready).
echo.
echo   Useful commands (run from this folder):
echo     docker compose -f docker-compose.export.yml ps        (check status)
echo     docker compose -f docker-compose.export.yml logs -f    (watch logs)
echo     docker compose -f docker-compose.export.yml down       (stop everything)
echo.
