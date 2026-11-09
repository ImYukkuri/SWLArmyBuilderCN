# stop-all.ps1 - one-click stop both apps
foreach ($port in 8770, 8765) {
  $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if (-not $conns) { Write-Host ("port " + $port + " not running") }
  else { foreach ($c in $conns) { Stop-Process -Id $c.OwningProcess -Force; Write-Host ("stopped port " + $port + " PID " + $c.OwningProcess) } }
}
