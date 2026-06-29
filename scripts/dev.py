#!/usr/bin/env python3
"""Run HomelabOS in development mode from repo root."""
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VENV_PYTHON = ROOT / ".venv" / "Scripts" / "python.exe"
if not VENV_PYTHON.exists():
    VENV_PYTHON = ROOT / ".venv" / "bin" / "python"

env = os.environ.copy()
env["HOMELABOS_DEV"] = "1"

if not VENV_PYTHON.exists():
    print("Creating virtualenv...")
    subprocess.check_call([sys.executable, "-m", "venv", str(ROOT / ".venv")])
    pip = ROOT / ".venv" / ("Scripts/pip.exe" if sys.platform == "win32" else "bin/pip")
    subprocess.check_call([str(pip), "install", "-r", str(ROOT / "requirements.txt")])

subprocess.check_call([str(VENV_PYTHON), "-m", "core"], cwd=ROOT, env=env)
