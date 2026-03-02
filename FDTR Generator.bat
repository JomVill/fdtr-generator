@echo off
title Faculty Daily Time Record
cd /d "%~dp0"

echo.
echo  ================================================
echo   Faculty Daily Time Record
echo  ================================================
echo.

REM ── Activate virtual environment ──────────────────
if exist "venv\Scripts\activate.bat" (
    call venv\Scripts\activate.bat
) else (
    echo  [ERROR] Virtual environment not found.
    echo.
    echo  Run these commands once to set it up:
    echo.
    echo    python -m venv venv
    echo    venv\Scripts\activate
    echo    pip install -r requirements.txt
    echo    copy .env.example .env
    echo.
    pause
    exit /b 1
)

REM ── Open browser after a short delay ──────────────
start /b "" cmd /c "timeout /t 2 >nul && start http://localhost:5050"

REM ── Start the app (window stays open showing URL) ─
python app.py

pause
