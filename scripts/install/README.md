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
