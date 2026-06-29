# HomelabOS

Touchscreen kiosk for Raspberry Pi — monitor your homelab from a dedicated panel.

## Install on fresh Raspberry Pi OS Lite (64-bit)

Flash SD card, then SSH in:

```bash
curl -fsSL https://raw.githubusercontent.com/Matff4/HomelabOS/refs/heads/master/install.sh | sudo bash
```

The script installs dependencies, clones to `/opt/homelabos`, enables `homelabos.service` + kiosk, and adds the **`homelabos-update`** command.

Reboot to start the kiosk on the attached display:

```bash
sudo reboot
```

## Updates

```bash
homelabos-update
homelabos-update --quiet-boot
homelabos-update --dev-vnc      # mirror kiosk display via VNC (development)
homelabos-update --no-dev-vnc   # remove VNC
```

## Dev VNC

Mirrors the exact Cage/Chromium kiosk output using **wayvnc** (Wayland-native).

```bash
homelabos-update --dev-vnc
```

Connect with TigerVNC or RealVNC Viewer to `<pi-ip>:5900` — no VNC login in dev mode (trusted LAN). The Wayland session is owned by your Unix user (eg `pi`).

```bash
sudo /opt/homelabos/scripts/dev-vnc.sh status
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

See [ROADMAP.md](ROADMAP.md).
