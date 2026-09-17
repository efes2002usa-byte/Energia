param([Parameter(Mandatory=$true)][string]$BackupFile)
$ErrorActionPreference = "Stop"
if (!(Test-Path -LiteralPath $BackupFile)) { throw "Backup file does not exist" }
$content = Get-Content -LiteralPath $BackupFile -Raw
if ($content -notmatch "CREATE TABLE") { throw "Backup does not contain schema" }
if ($content -notmatch "meter_readings") { throw "Backup does not contain meter readings table" }
Write-Output "Backup verified: $BackupFile"
