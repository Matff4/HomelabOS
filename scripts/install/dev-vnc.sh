#!/usr/bin/env bash
# Dev VNC — mirror the Cage/Wayland kiosk display (wayvnc).
# Usage: dev-vnc.sh {enable|disable|status}
# Called by install.sh; also: sudo /opt/homelabos/scripts/dev-vnc.sh status
set -euo pipefail

INSTALL_DIR="${HOMELABOS_INSTALL_DIR:-/opt/homelabos}"
SERVICE_USER="${HOMELABOS_SERVICE_USER:?HOMELABOS_SERVICE_USER required}"
SERVICE_UID="${HOMELABOS_SERVICE_UID:?HOMELABOS_SERVICE_UID required}"
SERVICE_HOME="${HOMELABOS_SERVICE_HOME:-/home/$SERVICE_USER}"
LOCAL_IP="${HOMELABOS_LOCAL_IP:-}"

VNC_PORT="${HOMELABOS_VNC_PORT:-5900}"
PASS_FILE="$INSTALL_DIR/data/dev-vnc.password"
WAYVNC_DIR="$SERVICE_HOME/.config/wayvnc"
WAYVNC_CONFIG="$WAYVNC_DIR/config"
SYSTEMD_UNIT="/etc/systemd/system/homelabos-vnc.service"

usage() {
  cat <<EOF
HomelabOS dev VNC — view the exact kiosk HDMI output remotely (wayvnc).

  sudo $0 enable     Install wayvnc + start homelabos-vnc.service
  sudo $0 disable    Stop and remove dev VNC service
  sudo $0 status     Show connection details

Connect with TigerVNC, RealVNC Viewer, etc.: <pi-ip>:${VNC_PORT}
Password file: $PASS_FILE

Install: homelabos-update --dev-vnc
Disable: homelabos-update --no-dev-vnc
EOF
}

require_root() {
  [[ "${EUID}" -eq 0 ]] || { echo "ERROR: Run with sudo." >&2; exit 1; }
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

ensure_password() {
  if [[ ! -f "$PASS_FILE" ]]; then
    openssl rand -base64 12 | tr -d '/+=' | head -c 16 > "$PASS_FILE"
    chown "$SERVICE_USER:$SERVICE_USER" "$PASS_FILE"
    chmod 600 "$PASS_FILE"
    echo "    Generated VNC password → $PASS_FILE"
  fi
}

write_wayvnc_config() {
  local pass
  pass="$(tr -d '\n' < "$PASS_FILE")"
  mkdir -p "$WAYVNC_DIR"
  cat > "$WAYVNC_CONFIG" <<EOF
# HomelabOS dev VNC — mirrors Cage on tty1 (managed by install script)
address=0.0.0.0
port=${VNC_PORT}
enable_auth=true
username=homelabos
password=${pass}
EOF
  chown -R "$SERVICE_USER:$SERVICE_USER" "$WAYVNC_DIR"
  chmod 700 "$WAYVNC_DIR"
  chmod 600 "$WAYVNC_CONFIG"
  echo "    $WAYVNC_CONFIG"
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
# Wait for Cage to create the Wayland socket
ExecStartPre=/bin/bash -c 'for i in \$(seq 1 120); do for s in "\$XDG_RUNTIME_DIR"/wayland-*; do [[ -S "\$s" ]] && exit 0; done; sleep 1; done; echo "Wayland socket not found"; exit 1'
ExecStart=/usr/bin/wayvnc -f ${WAYVNC_CONFIG}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
  echo "    $SYSTEMD_UNIT"
}

cmd_enable() {
  require_root
  echo "==> Enabling dev VNC (wayvnc)..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get install -y --no-install-recommends wayvnc

  ensure_password
  write_wayvnc_config
  write_systemd_unit

  systemctl daemon-reload
  systemctl enable homelabos-vnc.service
  systemctl restart homelabos-vnc.service 2>/dev/null || systemctl start homelabos-vnc.service

  local ip
  ip="$(detect_local_ip)"
  echo ""
  echo "Dev VNC ready:"
  echo "  Address : ${ip}:${VNC_PORT}"
  echo "  User    : homelabos"
  echo "  Password: $(tr -d '\n' < "$PASS_FILE")  (also in $PASS_FILE)"
  echo ""
  echo "  systemctl status homelabos-vnc"
}

cmd_disable() {
  require_root
  echo "==> Disabling dev VNC..."
  systemctl disable --now homelabos-vnc.service 2>/dev/null || true
  rm -f "$SYSTEMD_UNIT"
  systemctl daemon-reload
  echo "    homelabos-vnc.service removed (password kept at $PASS_FILE)"
}

cmd_status() {
  local ip
  ip="$(detect_local_ip)"
  echo "Dev VNC status:"
  systemctl is-active homelabos-vnc.service 2>/dev/null && echo "  service: active" || echo "  service: inactive"
  systemctl is-enabled homelabos-vnc.service 2>/dev/null && echo "  enabled: yes" || echo "  enabled: no"
  if [[ -f "$PASS_FILE" ]]; then
    echo "  address : ${ip}:${VNC_PORT}"
    echo "  user    : homelabos"
    echo "  password: $(tr -d '\n' < "$PASS_FILE")"
  else
    echo "  password: not configured (run enable)"
  fi
}

case "${1:-status}" in
  enable)  cmd_enable ;;
  disable) cmd_disable ;;
  status)  cmd_status ;;
  -h|--help) usage ;;
  *) echo "Unknown command: $1"; usage; exit 1 ;;
esac
