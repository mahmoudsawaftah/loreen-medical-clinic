# Backup script for the clinic management system.
# Dumps the PostgreSQL database (pg_dump, custom format) and copies the local
# attachments folder (storage/) into a timestamped backup directory.
# Keeps the last 14 backups, deletes older ones.
#
# Permanent PostgreSQL install (portable EDB runtime relocated from Temp):
#   binaries: C:\ClinicERP\PostgreSQL\pgsql
#   data dir: C:\ClinicERP\Data
# The old Temp copy is kept only as a last-resort fallback.
#
# Requirements:
#   - PostgreSQL tools on PATH, or adjust $PgDumpPath below.
#   - DATABASE_URL in .env (this script reads it; falls back to the default local DSN).
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\scripts\backup.ps1

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$BackupRoot = Join-Path $Root "backups"
$StorageDir = Join-Path $Root "storage"
$RetentionDays = 14
$PgDumpPath = "pg_dump"
$PermanentPgDump = "C:\ClinicERP\PostgreSQL\pgsql\bin\pg_dump.exe"
$PortablePgDump = "C:\Users\MRSAWA~1\AppData\Local\Temp\opencode\pgportable\pgsql\bin\pg_dump.exe"

if (Test-Path $PermanentPgDump) { $PgDumpPath = $PermanentPgDump }
elseif (Test-Path $PortablePgDump) { $PgDumpPath = $PortablePgDump }

# --- resolve DATABASE_URL -----------------------------------------------------
$envFile = Join-Path $Root ".env"
$dbUrl = $null
if (Test-Path $envFile) {
  foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*DATABASE_URL\s*=\s*"?(?<url>postgres(ql)?://[^"\s]+)"?\s*$') {
      $dbUrl = $Matches["url"]
      break
    }
  }
}
if (-not $dbUrl) { $dbUrl = "postgresql://clinic:clinic_dev_password@localhost:5432/clinic?schema=public" }

$uri = [System.Uri]::new($dbUrl)
$user = $uri.UserInfo.Split(":")[0]
$pass = $uri.UserInfo.Split(":")[1]
$host2 = $uri.Host
$port = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
$db = $uri.AbsolutePath.TrimStart("/").Split("?")[0]

# --- create backup folder -----------------------------------------------------
$stamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$target = Join-Path $BackupRoot $stamp
New-Item -ItemType Directory -Path $target -Force | Out-Null

# --- dump database (custom format, compressed) --------------------------------
Write-Host "Dumping database '$db' @ $host2`:$port ..."
$env:PGPASSWORD = $pass
& $PgDumpPath --host $host2 --port $port --username $user --dbname $db --format=custom --file (Join-Path $target "clinic.dump")
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed with exit code $LASTEXITCODE" }
Remove-Item Env:PGPASSWORD

Write-Host "Backup OK: $target"

# --- attachments --------------------------------------------------------------
if (Test-Path $StorageDir) {
  Copy-Item -Path $StorageDir -Destination $target -Recurse -Force
  Write-Host "Attachments copied (storage/)."
}

# --- retention ----------------------------------------------------------------
$old = Get-ChildItem -Path $BackupRoot -Directory | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$RetentionDays) }
foreach ($d in $old) { Remove-Item -LiteralPath $d.FullName -Recurse -Force; Write-Host "Removed old backup: $($d.Name)" }

Write-Host "Backup complete. Latest: $target"