# HomelabOS — Platform Development Guide

See [ROADMAP.md](ROADMAP.md) for architecture and phases.

**Frozen contracts (Phase 0):** [docs/CONTRACTS.md](docs/CONTRACTS.md)

## Local development

On your **laptop** (not the Pi), run the API without kiosk hardware:

```bash
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
pip install pytest httpx
HOMELABOS_DEV=1 python -m core
```

Or: `python scripts/dev.py` (sets `HOMELABOS_DEV=1` and creates `.venv` if missing).

`HOMELABOS_DEV=1` means:
- **`dev: true`** in `/api/health`
- **`mock_hal: true`** — no GPIO / Pi hardware required
- **Uvicorn auto-reload** when Python files change

Open http://localhost:8000

Quick API checks:

```bash
curl -s http://localhost:8000/api/health
curl -s http://localhost:8000/api/system/stats
curl -s http://localhost:8000/api/plugins
pytest
```

## JSON schemas

Pydantic models in `core/models/` are the source of truth. Regenerate after model changes:

```bash
python scripts/generate_schemas.py
pytest
```

## Shell development

```bash
cd shell && npm install && npm run dev
# Proxies /api to :8000
```

## Fresh Pi install (production)

One-liner — first install only:

```bash
curl -fsSL https://raw.githubusercontent.com/Matff4/HomelabOS/refs/heads/master/install.sh | sudo bash
```

Updates:

```bash
homelabos-update
homelabos-update --dev-vnc
```

Dev VNC status: `sudo /opt/homelabos/scripts/dev-vnc.sh status`

The installer detects the user who ran `sudo` and installs to `/opt/homelabos`.

Developer options (only when running from a local clone):

```bash
sudo bash install.sh --in-place   # skip copy to /opt
sudo bash install.sh --skip-kiosk # API only (no Cage/Chromium)
sudo bash install.sh --skip-build # skip npm build
```
