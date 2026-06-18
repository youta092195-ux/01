$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backend = Join-Path $root "backend"
$python = Join-Path $backend ".venv\Scripts\python.exe"
$cloudflared = Join-Path $root "tools\cloudflared\cloudflared.exe"
$data = Join-Path $backend "data"

Get-NetTCPConnection -LocalPort 8001 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
Get-Process cloudflared -ErrorAction SilentlyContinue |
  Stop-Process -Force -ErrorAction SilentlyContinue

Start-Process -FilePath $python -ArgumentList "run.py" -WorkingDirectory $backend `
  -RedirectStandardOutput (Join-Path $data "server.out.log") `
  -RedirectStandardError (Join-Path $data "server.err.log") `
  -WindowStyle Hidden

Start-Sleep -Seconds 3
$tunnelLog = Join-Path $data "cloudflared.log"
Remove-Item -LiteralPath $tunnelLog -Force -ErrorAction SilentlyContinue
Start-Process -FilePath $cloudflared `
  -ArgumentList @("tunnel", "--no-autoupdate", "--protocol", "http2", "--logfile", $tunnelLog, "--url", "http://127.0.0.1:8001") `
  -WorkingDirectory $root -WindowStyle Hidden

for ($attempt = 0; $attempt -lt 40; $attempt++) {
  if (Test-Path $tunnelLog) {
    $match = [regex]::Match(
      (Get-Content -Raw -LiteralPath $tunnelLog),
      "https://[a-z0-9-]+\.trycloudflare\.com"
    )
    if ($match.Success) {
      Set-Content -LiteralPath (Join-Path $root "PUBLIC_URL.txt") -Value ($match.Value + "/") -Encoding utf8
      Write-Output ($match.Value + "/")
      exit 0
    }
  }
  Start-Sleep -Milliseconds 500
}

throw "公開URLを取得できませんでした。backend\data\cloudflared.log を確認してください。"
