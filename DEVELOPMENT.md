# HomelabOS v2 — Platform Development Guide



See [ROADMAP.md](ROADMAP.md) for architecture and phases.



## v1 Reference



The proof-of-concept lives in `old/`. Use it as a template for plugin behavior, not as an API contract.



## Local development



```bash

python3 -m venv .venv

source .venv/bin/activate

pip install -r requirements.txt

pip install pytest httpx

HOMELABOS_DEV=1 python -m core

```



Or: `python scripts/dev.py`



## Shell development



```bash

cd shell && npm install && npm run dev

# Proxies /api to :8000

```



## Fresh Pi install (production)



One-liner — no git clone required:



```bash

curl -fsSL https://raw.githubusercontent.com/Matff4/HomelabOS/main/install.sh | sudo bash

```



The installer detects the user who ran `sudo` (the account created in Pi Imager) and installs to `/opt/homelabos`.



Developer options (only when running from a local clone):



```bash

sudo bash install.sh --in-place   # skip copy to /opt

sudo bash install.sh --skip-kiosk # API only (no Cage/Chromium)

sudo bash install.sh --skip-build # skip npm build

```

