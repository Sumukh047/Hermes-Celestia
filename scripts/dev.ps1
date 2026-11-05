$ErrorActionPreference='Stop'
if(-not(Test-Path .venv\Scripts\python.exe)){throw 'Run install.ps1 first'}
$py=(Resolve-Path .venv\Scripts\python.exe).Path
Start-Process powershell -ArgumentList '-NoExit','-Command',"& '$py' -m backend.main"
Start-Process powershell -ArgumentList '-NoExit','-Command','npm run dev --prefix frontend'
Write-Host 'Backend http://127.0.0.1:8790' -ForegroundColor Green
Write-Host 'Frontend http://127.0.0.1:5173' -ForegroundColor Green
