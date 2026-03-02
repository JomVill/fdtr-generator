#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo ""
echo " Starting Faculty Daily Time Record..."
echo ""

# Activate virtual environment
if [ -f "venv/bin/activate" ]; then
    source venv/bin/activate
else
    echo " [ERROR] Virtual environment not found."
    echo " Run this first:"
    echo "   python3 -m venv venv"
    echo "   source venv/bin/activate"
    echo "   pip install -r requirements.txt"
    echo ""
    exit 1
fi

python app.py
