@echo off
setlocal EnableExtensions
title Clinic ERP - START
color 0A

rem =====================================================================
rem  START_CLINIC.bat - start the Clinic ERP stack (PostgreSQL + Next.js)
rem  Permanent PostgreSQL:
rem    binaries : C:\ClinicERP\PostgreSQL\pgsql
rem    data dir : C:\ClinicERP\Data          (the existing cluster - never reinit)
rem  Logs: dev-server.log (project root) + C:\ClinicERP\Data\server.log
rem =====================================================================

set "PG_CTL=C:\ClinicERP\PostgreSQL\pgsql\bin\pg_ctl.exe"
set "PG_ISREADY=C:\ClinicERP\PostgreSQL\pgsql\bin\pg_isready.exe"
set "PGDATA=C:\ClinicERP\Data"
set "PGLOG=C:\ClinicERP\Data\server.log"

pushd "%~dp0"

if not exist "%PG_CTL%" (
  color 0C
  echo [ERROR] pg_ctl.exe not found: %PG_CTL%
  echo         PostgreSQL must be installed at C:\ClinicERP\PostgreSQL
  popd
  pause
  exit /b 1
)
if not exist "%PGDATA%\PG_VERSION" (
  color 0C
  echo [ERROR] Data directory not found: %PGDATA%
  echo         Do NOT initdb a new cluster - restore the existing one.
  popd
  pause
  exit /b 1
)

echo ============================================================
echo   Clinic ERP launcher - LOREEN BEAUTY CLINIC
echo ============================================================

rem ---------------- 1. PostgreSQL --------------------------------
netstat -ano | findstr ":5432" | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 (
  echo [OK]   PostgreSQL already running on port 5432 - skipping start
  goto pg_up
)

echo [..]   Starting PostgreSQL from %PGDATA% ...
start "" /b "%PG_CTL%" -D "%PGDATA%" -l "%PGLOG%" start < NUL

set /a pg_tries=0
:wait_pg
"%PG_ISREADY%" -h localhost -p 5432 -U clinic -q >nul 2>&1
if %errorlevel%==0 goto pg_up
set /a pg_tries+=1
if %pg_tries% gtr 60 (
  color 0C
  echo [ERROR] PostgreSQL did not become ready within 120s. See %PGLOG%
  popd
  pause
  exit /b 1
)
timeout /t 2 /nobreak >nul
goto wait_pg

:pg_up
echo [OK]   PostgreSQL is ready on port 5432

rem ---------------- 2. Next.js dev server ------------------------
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 (
  echo [OK]   Dev server already running on port 3000 - skipping start
  goto app_up
)

echo [..]   Starting Clinic ERP dev server (npm run dev) ...
start "ClinicERP Dev" /min cmd /c "npm run dev > dev-server.log 2>&1"

set /a app_tries=0
:wait_app
set "http_code=000"
for /f %%c in ('curl -s -o nul -w "%%{http_code}" http://localhost:3000/login 2^>nul') do set "http_code=%%c"
if "%http_code%"=="200" goto app_up
set /a app_tries+=1
if %app_tries% gtr 90 (
  color 0C
  echo [ERROR] App did not respond on port 3000. See dev-server.log
  popd
  pause
  exit /b 1
)
timeout /t 2 /nobreak >nul
goto wait_app

:app_up
echo [OK]   App reachable at http://localhost:3000/login
echo.
echo        Opening browser ...
start "" http://localhost:3000
echo        Done. You can close this window; the services keep running.
echo        Use STOP_CLINIC.bat to stop everything, CHECK_CLINIC.bat for status.
popd
endlocal
