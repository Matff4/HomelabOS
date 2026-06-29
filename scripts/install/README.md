# Kiosk stack

HomelabOS runs on the attached display via **Cage + Chromium**:

```
homelabos-kiosk.service
  └── cage (single-app Wayland compositor)
        └── scripts/kiosk-launch.sh
              └── chromium --kiosk --app=http://127.0.0.1:8000/?kiosk=true
```

Cage is purpose-built for kiosk use — one fullscreen client, no window manager overhead.

## Debugging (SSH session)

While the kiosk service owns tty1, you can test manually on another TTY or over SSH with a virtual output:

```bash
# Stop kiosk first
sudo systemctl stop homelabos-kiosk

# Manual test (requires active session / XDG_RUNTIME_DIR)
cage -- /opt/homelabos/scripts/kiosk-launch.sh
```

## Exit Cage during development

Pass `-s` to allow **Alt+Escape** to exit Cage:

```bash
cage -s -- /opt/homelabos/scripts/kiosk-launch.sh
```

Production systemd unit does **not** use `-s`.

## Quiet boot

Hide Pi firmware splash and boot text on the display:

```bash
sudo /opt/homelabos/scripts/quiet-boot.sh enable && sudo reboot
sudo /opt/homelabos/scripts/quiet-boot.sh disable && sudo reboot
sudo /opt/homelabos/scripts/quiet-boot.sh status
```

Install: `homelabos-update --quiet-boot`

## Dev VNC (wayvnc)

Mirrors the live Cage kiosk display — same pixels as the HDMI panel.

```bash
homelabos-update --dev-vnc
```

Connect: `<pi-ip>:5900` — no VNC login (dev mode). Session runs as your Unix user.

```bash
sudo /opt/homelabos/scripts/dev-vnc.sh status
homelabos-update --no-dev-vnc   # remove
```
