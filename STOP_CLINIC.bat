@echo off
setlocal EnableExtensions
title Clinic ERP - STOP
color 0E

rem =====================================================================
rem  STOP_CLINIC.bat - stop the Clinic ERP stack gracefully
rem    1. Next.js dev server (port 3000)
rem    2. PostgreSQL via pg_ctl (graceful fast, falls back to immediate)
rem  The database is NEVER killed with taskkill unless pg_ctl fails.
rem =====================================================================

set "PG_CTL=C:\ClinicERP\PostgreSQL\pgsql\bin\pg_ctl.exe"
set "PGDATA=C:\ClinicERP\Data"

echo Stopping Clinic ERP ...

rem ---------------- 1. Dev server on port 3000 --------------------
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
  echo [..]   Stopping dev server - PID %%p
  taskkill /PID %%p /F >nul 2>&1
)
echo [OK]   Dev server stopped (if it was running)

rem ---------------- 2. PostgreSQL -----------------------------------
netstat -ano | findstr ":5432" | findstr "LISTENING" >nul 2>&1
if %errorlevel%==1 (
  echo [OK]   PostgreSQL is not running
  goto done
)

echo [..]   Stopping PostgreSQL gracefully (pg_ctl -m fast) ...
"%PG_CTL%" -D "%PGDATA%" stop -m fast
if %errorlevel%==0 goto stopped

echo [!!]   Fast shutdown failed - retrying with immediate shutdown ...
"%PG_CTL%" -D "%PGDATA%" stop -m immediate
if %errorlevel%==0 goto stopped

color 0C
echo [ERROR] pg_ctl could not stop PostgreSQL. Check C:\ClinicERP\Data\server.log
pause
exit /b 1

:stopped
echo [OK]   PostgreSQL stopped

:done
echo.
echo All services stopped. Bye.
endlocal
