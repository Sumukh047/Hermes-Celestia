$ErrorActionPreference='Stop'
& .\.venv\Scripts\pip.exe install pyinstaller
& .\.venv\Scripts\python.exe -m PyInstaller --name hermes-agent-backend --onedir --noconsole --clean backend\main.py
Push-Location frontend; npm run build; Pop-Location
Push-Location desktop\src-tauri; cargo tauri build; Pop-Location
Write-Host 'Tauri installer is under desktop\src-tauri\target\release\bundle' -ForegroundColor Green
