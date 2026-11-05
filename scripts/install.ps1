$ErrorActionPreference='Stop'
if(-not(Get-Command python -ErrorAction SilentlyContinue)){throw 'Python 3.12+ required'}
if(-not(Get-Command node -ErrorAction SilentlyContinue)){throw 'Node.js 20+ required'}
if(-not(Test-Path .venv)){python -m venv .venv}
& .\.venv\Scripts\python.exe -m pip install --upgrade pip
& .\.venv\Scripts\pip.exe install -r backend\requirements.txt
Push-Location frontend; npm install; Pop-Location
Write-Host 'Installed. Start LM Studio server, then run scripts\dev.ps1' -ForegroundColor Green
