def test_project_files():
 from pathlib import Path
 assert Path('backend/main.py').exists()
 assert Path('frontend/src/App.tsx').exists()
