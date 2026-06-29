#!/usr/bin/env bash
# Dev VNC — mirror the Cage/Wayland kiosk display (wayvnc).
# Usage: dev-vnc.sh {enable|disable|status}
set -euo pipefail

INSTALL_DIR="${HOMELABOS_INSTALL_DIR:-/opt/homelabos}"
SERVICE_USER="${HOMELABOS_SERVICE_USER:?HOMELABOS_SERVICE_USER required}"
SERVICE_UID="${HOMELABOS_SERVICE_UID:?HOMELABOS_SERVICE_UID required}"
SERVICE_HOME="${HOMELABOS_SERVICE_HOME:-/home/$SERVICE_USER}"
LOCAL_IP="${HOMELABOS_LOCAL_IP:-}"

VNC_PORT="${HOMELABOS_VNC_PORT:-5900}"
WAYVNC_DIR="$SERVICE_HOME/.config/wayvnc"
WAYVNC_CONFIG="$WAYVNC_DIR/config"
SYSTEMD_UNIT="/etc/systemd/system/homelabos-vnc.service"

usage() {
  cat <<EOF
HomelabOS dev VNC — view the exact kiosk HDMI output remotely (wayvnc).

  sudo $0 enable     Install wayvnc + start homelabos-vnc.service
  sudo $0 disable    Stop and remove dev VNC service
  sudo $0 status     Show connection details

Connect: <pi-ip>:${VNC_PORT}  (no VNC login — dev mode, trusted LAN only)
The session runs as Unix user: ${SERVICE_USER}

Install: homelabos-update --dev-vnc
Disable: homelabos-update --no-dev-vnc
EOF
}

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "ERROR: Run with sudo." >&2
    exit 1
  fi
}

detect_local_ip() {
  if [[ -n "$LOCAL_IP" ]]; then
    echo "$LOCAL_IP"
    return
  fi
  ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i=1;i<=NF;i++) if ($i=="src") {print $(i+1); exit}}' \
    || hostname -I 2>/dev/null | awk '{print $1}' \
    || echo "127.0.0.1"
}

write_wayvnc_config() {
  mkdir -p "$WAYVNC_DIR"
  # enable_auth=false: required for RealVNC Viewer compatibility on dev setups.
  # Auth with password needs TLS/RSA certs (see wayvnc man); incomplete config is ignored → open access.
  cat > "$WAYVNC_CONFIG" <<EOF
# HomelabOS dev VNC — mirrors Cage on tty1 (managed by install script)
address=0.0.0.0
port=${VNC_PORT}
enable_auth=false
EOF
  chown -R "$SERVICE_USER:$SERVICE_USER" "$WAYVNC_DIR"
  chmod 700 "$WAYVNC_DIR"
  chmod 644 "$WAYVNC_CONFIG"
  echo "    $WAYVNC_CONFIG (enable_auth=false, dev/LAN only)"
}

write_systemd_unit() {
  cat > "$SYSTEMD_UNIT" <<EOF
[Unit]
Description=HomelabOS Dev VNC (wayvnc — mirrors kiosk display)
After=homelabos-kiosk.service
PartOf=homelabos-kiosk.service

[Service]
User=${SERVICE_USER}
Environment=XDG_RUNTIME_DIR=/run/user/${SERVICE_UID}
ExecStartPre=/bin/bash -c 'for i in \$(seq 1 120); do for s in "\$XDG_RUNTIME_DIR"/wayland-*; do [[ -S "\$s" ]] && exit 0; done; sleep 1; done; echo "Wayland socket not found"; exit 1'
ExecStart=/usr/bin/wayvnc -f ${WAYVNC_CONFIG}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
  echo "    $SYSTEMD_UNIT (runs as Unix user ${SERVICE_USER})"
}

cmd_enable() {
  require_root
  echo "==> Enabling dev VNC (wayvnc)..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get install -y --no-install-recommends wayvnc

  write_wayvnc_config
  write_systemd_unit

  systemctl daemon-reload
  systemctl enable homelabos-vnc.service
  systemctl restart homelabos-vnc.service 2>/dev/null || systemctl start homelabos-vnc.service

  local ip
  ip="$(detect_local_ip)"
  echo ""
  echo "Dev VNC ready:"
  echo "  Address    : ${ip}:${VNC_PORT}"
  echo "  Session as : ${SERVICE_USER} (your Unix user — no separate VNC account)"
  echo "  Auth       : none (dev mode; trusted LAN only)"
  echo ""
  echo "  systemctl status homelabos-vnc"
}

cmd_disable() {
  require_root
  echo "==> Disabling dev VNC..."
  systemctl disable --now homelabos-vnc.service 2>/dev/null || true
  rm -f "$SYSTEMD_UNIT"
  systemctl daemon-reload
  echo "    homelabos-vnc.service removed"
}

cmd_status() {
  local ip
  ip="$(detect_local_ip)"
  echo "Dev VNC status:"
  systemctl is-active homelabos-vnc.service 2>/dev/null && echo "  service: active" || echo "  service: inactive"
  systemctl is-enabled homelabos-vnc.service 2>/dev/null && echo "  enabled: yes" || echo "  enabled: no"
  echo "  address    : ${ip}:${VNC_PORT}"
  echo "  session as : ${SERVICE_USER}"
  if [[ -f "$WAYVNC_CONFIG" ]]; then
    grep -E '^enable_auth=' "$WAYVNC_CONFIG" 2>/dev/null || echo "  enable_auth: (not set)"
  fi
}

case "${1:-status}" in
  enable)  cmd_enable ;;
  disable) cmd_disable ;;
  status)  cmd_status ;;
  -h|--help) usage ;;
  *) echo "Unknown command: $1"; usage; exit 1 ;;
esac
