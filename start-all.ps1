# start-all.ps1 - one-click start both apps
Set-Location -LiteralPath $PSScriptRoot
function Test-Port($port) { return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) }
if (Test-Port 8770) { Write-Host "8770 already running" } else { Start-Process powershell -ArgumentList "-NoExit","-Command","python server.py --port 8770"; Write-Host "started 8770" }
if (Test-Port 8765) { Write-Host "8765 already running" } else { Start-Process powershell -ArgumentList "-NoExit","-Command","python -m http.server 8765 --directory dist --bind 127.0.0.1"; Write-Host "started 8765" }
Start-Sleep -Seconds 2
Start-Process "http://127.0.0.1:8770/"
Start-Process "http://127.0.0.1:8765/"
