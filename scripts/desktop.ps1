$ErrorActionPreference='Stop'
if(-not(Test-Path .venv\Scripts\python.exe)){throw 'Run install.ps1 first'}
$py=(Resolve-Path .venv\Scripts\python.exe).Path
Write-Host 'Starting Backend API...' -ForegroundColor Cyan
Start-Process powershell -ArgumentList '-NoExit','-Command',"& '$py' -m backend.main"
Write-Host 'Starting Tauri Desktop App...' -ForegroundColor Cyan
Push-Location desktop\src-tauri
cargo tauri dev
Pop-Location
