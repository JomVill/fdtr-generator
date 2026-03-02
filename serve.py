"""
Production server launcher (Windows / LAN use).
Uses waitress — a production-grade WSGI server with no dev warnings.
For cloud deployment, gunicorn is used via the Procfile instead.
"""

import os
import socket

from dotenv import load_dotenv
from waitress import serve

from app import app

load_dotenv()

port = int(os.environ.get("PORT", 5050))

# ── Detect LAN IP and hostname ────────────────────────────────────────────
try:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.connect(("8.8.8.8", 80))
    lan_ip = s.getsockname()[0]
    s.close()
except Exception:
    lan_ip = "127.0.0.1"

hostname = socket.gethostname()

# ── Startup banner ────────────────────────────────────────────────────────
print()
print("=" * 54)
print("  Faculty Daily Time Record — ready")
print("=" * 54)
print(f"  This machine only : http://127.0.0.1:{port}")
print(f"  Share via IP      : http://{lan_ip}:{port}")
print(f"  Share via hostname: http://{hostname}:{port}")
print("=" * 54)
print("  Press Ctrl+C to stop.")
print()

serve(app, host="0.0.0.0", port=port)
