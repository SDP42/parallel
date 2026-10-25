# Parallel: one-command setup + run for Windows (PowerShell).
# Usage:  powershell -ExecutionPolicy Bypass -File .\run.ps1
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location "$Root\backend"
if (-not (Test-Path ".venv")) {
  Write-Host "-> Creating Python virtual environment"
  py -3 -m venv .venv
}
& ".\.venv\Scripts\python.exe" -m pip install -q -r requirements.txt
if (-not (Test-Path "models\LATEST")) {
  Write-Host "-> Generating the synthetic dataset and training models (~1 min)"
  & ".\.venv\Scripts\python.exe" -m ml.dataset --users 60 --days 30
  & ".\.venv\Scripts\python.exe" -m ml.train
}
Write-Host "-> Starting API on http://127.0.0.1:8787"
$api = Start-Process -FilePath ".\.venv\Scripts\python.exe" -ArgumentList "-m","uvicorn","app.main:app","--port","8787" -PassThru -NoNewWindow
try {
  Set-Location "$Root\frontend"
  if (-not (Test-Path "node_modules")) { npm install }
  Write-Host "-> Starting web app on http://localhost:5180"
  npm run dev -- --port 5180
} finally {
  Stop-Process -Id $api.Id -ErrorAction SilentlyContinue
}
