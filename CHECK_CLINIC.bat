@echo off
setlocal EnableExtensions
title Clinic ERP - CHECK
color 0B

rem =====================================================================
rem  CHECK_CLINIC.bat - health/status overview for the Clinic ERP stack
rem  Shows: PostgreSQL state, port 5432, DB reachability, data sanity,
rem         app reachability on :3000, and backup folder status.
rem =====================================================================

set "PG_ISREADY=C:\ClinicERP\PostgreSQL\pgsql\bin\pg_isready.exe"
set "PSQL=C:\ClinicERP\PostgreSQL\pgsql\bin\psql.exe"
set "PGDATA=C:\ClinicERP\Data"
set "PGPASSWORD=clinic_dev_password"

echo ============================================================
echo   Clinic ERP - status check
echo ============================================================

rem ---------------- 1. PostgreSQL process -----------------------
tasklist /FI "IMAGENAME eq postgres.exe" 2>nul | findstr /I "postgres.exe" >nul 2>&1
if %errorlevel%==0 (
  echo [OK]   PostgreSQL process is running
) else (
  echo [--]   No postgres.exe process found
)

rem ---------------- 2. Port 5432 --------------------------------
netstat -ano | findstr ":5432" | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 (
  echo [OK]   Port 5432 is listening
) else (
  echo [!!]   Port 5432 is NOT listening
)

rem ---------------- 3. DB reachable -----------------------------
"%PG_ISREADY%" -h localhost -p 5432 -U clinic -q >nul 2>&1
if %errorlevel%==0 (
  echo [OK]   PostgreSQL accepts connections (pg_isready)
) else (
  echo [!!]   PostgreSQL not reachable
)

rem ---------------- 4. Data sanity ------------------------------
if exist "%PSQL%" (
  for /f "delims=" %%u in ('"%PSQL%" -h localhost -p 5432 -U clinic -d clinic -tAc "SELECT count(*) FROM "User";" 2^>nul') do set "USER_COUNT=%%u"
  for /f "delims=" %%c in ('"%PSQL%" -h localhost -p 5432 -U clinic -d clinic -tAc "SELECT count(*) FROM "Customer";" 2^>nul') do set "CUSTOMER_COUNT=%%c"
  echo [OK]   Users: %USER_COUNT%   Customers: %CUSTOMER_COUNT%
) else (
  echo [--]   psql not found at %PSQL%
)

rem ---------------- 5. App on :3000 -----------------------------
set "http_code=000"
for /f %%c in ('curl -s -o nul -w "%%{http_code}" http://localhost:3000/login 2^>nul') do set "http_code=%%c"
if "%http_code%"=="200" (
  echo [OK]   App reachable - http://localhost:3000/login returns 200
) else (
  echo [!!]   App NOT reachable on port 3000 (code %http_code%^)
)

rem ---------------- 6. Backups -------------------------------
set "BACKUP_DIR=%~dp0backups"
set "LATEST_BACKUP="
set "BACKUP_COUNT=0"
if exist "%BACKUP_DIR%" (
  for /f %%d in ('dir /b /ad /o-d "%BACKUP_DIR%" 2^>nul') do if not defined LATEST_BACKUP set "LATEST_BACKUP=%%d"
  for /f %%c in ('dir /b /ad "%BACKUP_DIR%" 2^>nul ^| find /c /v ""') do set "BACKUP_COUNT=%%c"
  if not defined LATEST_BACKUP set "LATEST_BACKUP=none"
  echo [OK]   Backups folder: %BACKUP_DIR%
  echo        Number of backups: %BACKUP_COUNT%   Latest: %LATEST_BACKUP%
  echo        Manual: powershell -ExecutionPolicy Bypass -File "%~dp0scripts\backup.ps1"
) else (
  echo [--]   No backups folder found
)

echo.
echo Done. See README.md for the full startup procedure.
endlocal
