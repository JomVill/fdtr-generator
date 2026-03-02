@echo off
title Faculty Daily Time Record
cd /d "%~dp0"

echo.
echo  Starting Faculty Daily Time Record...
echo.

REM Activate virtual environment
if exist "venv\Scripts\activate.bat" (
    call venv\Scripts\activate.bat
) else (
    echo  [ERROR] Virtual environment not found.
    echo  Run this first:  python -m venv venv
    echo                   venv\Scripts\activate
    echo                   pip install -r requirements.txt
    echo.
    pause
    exit /b 1
)

REM Start the app (keeps this window open showing the URL)
python app.py

pause
