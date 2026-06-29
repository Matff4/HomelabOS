# HomelabOS

Touchscreen kiosk for Raspberry Pi — monitor your homelab from a dedicated panel.

## Install on fresh Raspberry Pi OS Lite (64-bit)

Flash SD card, then SSH in:

```bash
curl -fsSL https://raw.githubusercontent.com/Matff4/HomelabOS/refs/heads/master/install.sh | sudo bash
```

Safe to re-run if the connection drops mid-install.

Verify the downloaded script before running (should show `rev 2025-06-29-2` and `REPO_BRANCH="master"`):

```bash
curl -fsSL https://raw.githubusercontent.com/Matff4/HomelabOS/refs/heads/master/install.sh | head -20
```

If install tries branch `main` or prints `v2 installer`, you are running a stale script — push latest to GitHub `master`, then re-run.

The script will:

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

## Quiet boot (optional)

Hide the Pi splash screen and boot text on the display:

```bash
sudo /opt/homelabos/scripts/quiet-boot.sh enable && sudo reboot
```

Or during install:

```bash
curl -fsSL https://raw.githubusercontent.com/Matff4/HomelabOS/refs/heads/master/install.sh | sudo bash -s -- --quiet-boot
```

Restore default boot output: `sudo /opt/homelabos/scripts/quiet-boot.sh disable && sudo reboot`
