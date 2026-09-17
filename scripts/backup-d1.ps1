param(
  [string]$OutputDirectory = "./backups",
  [switch]$Remote
)

$ErrorActionPreference = "Stop"
$wrangler = Join-Path $PSScriptRoot "../node_modules/wrangler/bin/wrangler.js"
$node = "C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$target = [IO.Path]::GetFullPath((Join-Path $OutputDirectory "energia-$stamp.sql"))
New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($target)) -Force | Out-Null
$args = @($wrangler, "d1", "export", "DB", "--local", "--output", $target)
if ($Remote) { $args = @($wrangler, "d1", "export", "DB", "--remote", "--output", $target) }
& $node @args
if ($LASTEXITCODE -ne 0) { throw "D1 backup failed with exit code $LASTEXITCODE" }
if (!(Test-Path -LiteralPath $target)) { throw "Backup file was not created: $target" }
Write-Output $target
