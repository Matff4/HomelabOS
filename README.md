# HomelabOS v2

Kiosk dashboard platform for Raspberry Pi homelabs.

## Install on fresh Raspberry Pi OS (64-bit)

Flash SD card with [Raspberry Pi Imager](https://www.raspberrypi.com/software/) — create your user account there (recommended). Then SSH in or open a terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/Matff4/HomelabOS/main/install.sh | sudo bash
```

That's it. The script will:

- Install system dependencies (Python, Chromium, Cage, Node.js)
- Clone this repo to `/opt/homelabos`
- Run services as **your user** (detected from `sudo`)
- Enable the API (`homelabos.service`) and kiosk (`homelabos-kiosk.service`)

Reboot to start the kiosk on the attached display:

```bash
sudo reboot
```

## Development (local machine)

```bash
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
HOMELABOS_DEV=1 python -m core
```

Open http://localhost:8000

## Developer install on Pi (from a clone)

```bash
git clone https://github.com/Matff4/HomelabOS.git
cd HomelabOS
sudo bash install.sh              # copies to /opt/homelabos
sudo bash install.sh --in-place   # run directly from clone
```

See [ROADMAP.md](ROADMAP.md) for the v2 plan. v1 PoC code is in `old/`.
