#!/usr/bin/env bash
# HomelabOS — Raspberry Pi OS (64-bit) installer
#
# One-liner:
#   curl -fsSL https://raw.githubusercontent.com/Matff4/HomelabOS/refs/heads/master/install.sh | sudo bash
#
# Safe to re-run if interrupted. Log output:
#   curl -fsSL .../install.sh | sudo bash 2>&1 | tee /tmp/homelabos-install.log
#
set -euo pipefail

# Bump when debugging install issues — printed at runtime so you can verify what ran.
INSTALLER_REV="2025-06-29-2"
INSTALL_SCRIPT_URL="https://raw.githubusercontent.com/Matff4/HomelabOS/refs/heads/master/install.sh"

INSTALL_DIR="/opt/homelabos"
REPO_URL="https://github.com/Matff4/HomelabOS.git"
REPO_BRANCH="master"
BRANCH_EXPLICIT=0

IN_PLACE=0
SKIP_KIOSK=0
SKIP_BUILD=0
QUIET_BOOT=0
SERVICE_USER=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --in-place)   IN_PLACE=1 ;;
    --user)       SERVICE_USER="$2"; shift ;;
    --dir)        INSTALL_DIR="$2"; shift ;;
    --branch)     REPO_BRANCH="$2"; BRANCH_EXPLICIT=1; shift ;;
    --repo)       REPO_URL="$2"; shift ;;
    --skip-kiosk) SKIP_KIOSK=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    --quiet-boot) QUIET_BOOT=1 ;;
    -h|--help)
      cat <<EOF
HomelabOS installer

  curl -fsSL $INSTALL_SCRIPT_URL | sudo bash

Safe to re-run after an interrupted install.

Options:
  --in-place      Install from local checkout (developer)
  --skip-kiosk    API only
  --skip-build    Skip npm shell build
  --quiet-boot    Hide Pi splash and boot text on display (reboot required)
  --branch BR     Git branch (default: master, remote install only)

Pass flags through curl: curl ... | sudo bash -s -- --quiet-boot

Note: branch is NOT read from environment variables (avoids stale HOMELABOS_BRANCH=main).
EOF
      exit 0
      ;;
    *) echo "Unknown option: $1 (try --help)"; exit 1 ;;
  esac
  shift
done

on_error() {
  echo ""
  echo "ERROR: Install interrupted or failed (line $1)." >&2
  echo "Re-run the same command — the installer is safe to run again." >&2
  echo "  curl -fsSL $INSTALL_SCRIPT_URL | sudo bash" >&2
}
trap 'on_error $LINENO' ERR

# ── Detect local checkout vs curl pipe ────────────────────────────────────────
is_local_checkout=0
SCRIPT_SRC="${BASH_SOURCE[0]:-}"

case "$SCRIPT_SRC" in
  bash|sh|""|"-") ;;
  /dev/fd/*|/proc/self/fd/*) ;;
  *)
    SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_SRC")" && pwd)"
    if [[ -f "$SCRIPT_DIR/core/app.py" ]]; then
      is_local_checkout=1
      LOCAL_REPO="$SCRIPT_DIR"
    fi
    ;;
esac

if [[ "$is_local_checkout" -eq 1 && "$IN_PLACE" -eq 1 ]]; then
  INSTALL_DIR="$LOCAL_REPO"
fi

# curl | sudo bash must always clone master unless --branch was passed explicitly
if [[ "$is_local_checkout" -eq 0 && "$BRANCH_EXPLICIT" -eq 0 ]]; then
  REPO_BRANCH="master"
fi

if [[ "${EUID}" -ne 0 ]]; then
  echo "ERROR: Run with sudo:"
  echo "  curl -fsSL $INSTALL_SCRIPT_URL | sudo bash"
  exit 1
fi

detect_service_user() {
  if [[ -n "$SERVICE_USER" ]]; then echo "$SERVICE_USER"; return; fi
  if [[ -n "${SUDO_USER:-}" && "$SUDO_USER" != "root" ]]; then echo "$SUDO_USER"; return; fi
  local u
  u="$(getent passwd | awk -F: '$3 >= 1000 && $3 < 65534 && $7 !~ /nologin|false/ { print $1; exit }')"
  if [[ -n "$u" ]]; then echo "$u"; return; fi
  echo "ERROR: Could not detect a user account. Run with sudo from your login user." >&2
  exit 1
}

SERVICE_USER="$(detect_service_user)"
SERVICE_UID="$(id -u "$SERVICE_USER")"
ARCH="$(uname -m)"

get_local_ip() {
  local ip
  ip="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i=1;i<=NF;i++) if ($i=="src") {print $(i+1); exit}}')"
  if [[ -z "$ip" ]]; then
    ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  fi
  echo "${ip:-127.0.0.1}"
}

LOCAL_IP="$(get_local_ip)"

echo "==> HomelabOS installer (rev $INSTALLER_REV)"
echo "    branch : $REPO_BRANCH"
echo "    arch   : $ARCH"
echo "    user   : $SERVICE_USER (uid $SERVICE_UID)"
echo "    ip     : $LOCAL_IP"
echo "    target : $INSTALL_DIR"
echo ""
echo "    Tip: if SSH drops, re-run the same install command."

# ── System packages ───────────────────────────────────────────────────────────
echo "==> [1/7] System packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y --no-install-recommends \
  python3 python3-venv python3-pip python3-dev \
  git curl ca-certificates rsync \
  build-essential \
  chromium \
  cage seatd \
  libglib2.0-0 libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
  libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2

HARDWARE_EXTRAS=""
if [[ "$ARCH" == "aarch64" || "$ARCH" == "armv7l" ]]; then
  apt-get install -y --no-install-recommends python3-lgpio || true
  HARDWARE_EXTRAS="gpiozero"
fi

for grp in video input render gpio i2c spi; do
  getent group "$grp" >/dev/null && usermod -aG "$grp" "$SERVICE_USER" || true
done

systemctl enable --now seatd.service

# ── Deploy source ─────────────────────────────────────────────────────────────
echo "==> [2/7] Deploy application..."

deploy_git() {
  if [[ -d "$INSTALL_DIR/.git" ]]; then
    echo "    Updating existing clone..."
    git -C "$INSTALL_DIR" fetch origin "$REPO_BRANCH"
    git -C "$INSTALL_DIR" reset --hard "origin/$REPO_BRANCH"
  else
    echo "    Cloning $REPO_URL (branch: $REPO_BRANCH)..."
    rm -rf "$INSTALL_DIR"
    git clone --depth 1 --branch "$REPO_BRANCH" "$REPO_URL" "$INSTALL_DIR"
  fi
}

if [[ "$is_local_checkout" -eq 1 && "$IN_PLACE" -eq 1 ]]; then
  echo "    Using local checkout: $INSTALL_DIR"
elif [[ "$is_local_checkout" -eq 1 ]]; then
  mkdir -p "$INSTALL_DIR"
  rsync -a --delete \
    --exclude '.git' --exclude 'old' --exclude 'node_modules' \
    --exclude '.venv' --exclude 'shell/dist' --exclude 'data/*.json' \
    "$LOCAL_REPO/" "$INSTALL_DIR/"
else
  deploy_git
fi

if [[ ! -f "$INSTALL_DIR/core/app.py" ]]; then
  echo "ERROR: Deploy failed — core/app.py missing. Removing broken tree."
  rm -rf "$INSTALL_DIR"
  exit 1
fi

mkdir -p "$INSTALL_DIR/data" "$INSTALL_DIR/data/plugins"
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"

# ── Python ────────────────────────────────────────────────────────────────────
echo "==> [3/7] Python environment..."
if [[ ! -d "$INSTALL_DIR/.venv" ]]; then
  sudo -u "$SERVICE_USER" python3 -m venv "$INSTALL_DIR/.venv"
fi
sudo -u "$SERVICE_USER" "$INSTALL_DIR/.venv/bin/pip" install --upgrade pip wheel
sudo -u "$SERVICE_USER" "$INSTALL_DIR/.venv/bin/pip" install -r "$INSTALL_DIR/requirements.txt"
if [[ -n "$HARDWARE_EXTRAS" ]]; then
  sudo -u "$SERVICE_USER" "$INSTALL_DIR/.venv/bin/pip" install $HARDWARE_EXTRAS
fi

# ── Environment + systemd (API) — before slow npm step ────────────────────────
echo "==> [4/7] homelabos.service..."
ENV_FILE="$INSTALL_DIR/.env"
PREV_QUIET_BOOT=0
if [[ -f "$ENV_FILE" ]] && grep -q '^HOMELABOS_QUIET_BOOT=1' "$ENV_FILE"; then
  PREV_QUIET_BOOT=1
fi
QUIET_BOOT_VALUE=0
if [[ "$QUIET_BOOT" -eq 1 || "$PREV_QUIET_BOOT" -eq 1 ]]; then
  QUIET_BOOT_VALUE=1
fi
cat > "$ENV_FILE" <<EOF
HOMELABOS_DEV=0
HOMELABOS_HOST=0.0.0.0
HOMELABOS_PORT=8000
HOMELABOS_INSTALL_DIR=$INSTALL_DIR
HOMELABOS_QUIET_BOOT=$QUIET_BOOT_VALUE
EOF
chown "$SERVICE_USER:$SERVICE_USER" "$ENV_FILE"
chmod 640 "$ENV_FILE"

cat > /etc/systemd/system/homelabos.service <<EOF
[Unit]
Description=HomelabOS Dashboard API
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$INSTALL_DIR
EnvironmentFile=$ENV_FILE
ExecStart=$INSTALL_DIR/.venv/bin/python -m core
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable homelabos.service
systemctl restart homelabos.service

# ── Node.js (apt first — avoids fragile curl|bash over SSH) ─────────────────────
node_major() {
  node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1
}

install_nodejs() {
  if command -v node >/dev/null 2>&1 && [[ "$(node_major)" -ge 18 ]]; then
    echo "    Node.js $(node -v) already installed"
    return 0
  fi
  echo "    Trying nodejs from apt..."
  apt-get install -y nodejs npm 2>/dev/null || apt-get install -y nodejs || true
  if command -v node >/dev/null 2>&1 && [[ "$(node_major)" -ge 18 ]]; then
    echo "    Node.js $(node -v) from apt"
    return 0
  fi
  echo "    Installing Node.js 20 from NodeSource (may take a minute)..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
}

# ── Shell build (non-fatal) ───────────────────────────────────────────────────
echo "==> [5/7] Shell build..."
BUILD_OK=0
if [[ "$SKIP_BUILD" -eq 1 ]]; then
  echo "    Skipped (--skip-build)"
elif install_nodejs && command -v npm >/dev/null 2>&1; then
  if sudo -u "$SERVICE_USER" bash -c "cd '$INSTALL_DIR/shell' && (npm ci 2>/dev/null || npm install) && npm run build"; then
    BUILD_OK=1
    echo "    Shell built OK"
  else
    echo "    WARN: shell build failed — API still works; re-run install to retry"
  fi
else
  echo "    WARN: npm not available — skipping shell build; re-run install to retry"
fi

# ── Kiosk ─────────────────────────────────────────────────────────────────────
if [[ "$SKIP_KIOSK" -eq 0 ]]; then
  echo "==> [6/7] homelabos-kiosk.service..."

  install -o "$SERVICE_USER" -g "$SERVICE_USER" -m 755 \
    "$INSTALL_DIR/scripts/install/kiosk-launch.sh" \
    "$INSTALL_DIR/scripts/kiosk-launch.sh"

  loginctl enable-linger "$SERVICE_USER" 2>/dev/null || true

  # Boot to tty1 kiosk, not desktop login manager
  if systemctl is-active --quiet lightdm.service 2>/dev/null || \
     systemctl is-enabled --quiet lightdm.service 2>/dev/null; then
    echo "    Disabling lightdm — kiosk uses tty1 (Pi OS Desktop detected)"
    systemctl disable lightdm.service 2>/dev/null || true
    systemctl stop lightdm.service 2>/dev/null || true
  fi
  systemctl set-default multi-user.target

  cat > /etc/systemd/system/homelabos-kiosk.service <<EOF
[Unit]
Description=HomelabOS Kiosk (Cage + Chromium)
After=homelabos.service seatd.service
Requires=homelabos.service
Conflicts=getty@tty1.service

[Service]
User=$SERVICE_USER
Environment=XDG_RUNTIME_DIR=/run/user/$SERVICE_UID
Environment=XDG_SESSION_TYPE=wayland
PAMName=login
TTYPath=/dev/tty1
TTYReset=yes
TTYVHangup=yes
TTYVTDisallocate=yes
ExecStart=/usr/bin/cage -- $INSTALL_DIR/scripts/kiosk-launch.sh
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable homelabos-kiosk.service
else
  echo "==> [6/7] Kiosk skipped (--skip-kiosk)"
fi

# ── sudoers ───────────────────────────────────────────────────────────────────
echo "==> [7/7] Finalizing..."
SUDOERS_FILE="/etc/sudoers.d/homelabos"
cat > "$SUDOERS_FILE" <<EOF
# HomelabOS — power management for $SERVICE_USER
$SERVICE_USER ALL=(root) NOPASSWD: /sbin/reboot, /sbin/shutdown, /bin/systemctl restart homelabos-kiosk.service
EOF
chmod 440 "$SUDOERS_FILE"

# ── Quiet boot (optional) ─────────────────────────────────────────────────────
install -m 755 "$INSTALL_DIR/scripts/install/quiet-boot.sh" "$INSTALL_DIR/scripts/quiet-boot.sh"
if [[ "$QUIET_BOOT_VALUE" -eq 1 ]]; then
  echo "==> Enabling quiet boot..."
  HOMELABOS_INSTALL_DIR="$INSTALL_DIR" "$INSTALL_DIR/scripts/quiet-boot.sh" enable
fi

trap - ERR

echo ""
echo "════════════════════════════════════════════════════════════"
echo " HomelabOS installed successfully"
echo "════════════════════════════════════════════════════════════"
echo " Install dir : $INSTALL_DIR"
echo " Service user: $SERVICE_USER"
echo " Git branch  : $REPO_BRANCH"
echo " API (local) : http://127.0.0.1:8000/api/health"
echo " API (lan)   : http://${LOCAL_IP}:8000/api/health"
echo " Shell build : $([[ "$BUILD_OK" -eq 1 ]] && echo OK || echo skipped/failed — re-run install)"
echo ""
echo "   systemctl status homelabos"
if [[ "$SKIP_KIOSK" -eq 0 ]]; then
  echo "   sudo systemctl start homelabos-kiosk"
  echo "   sudo reboot                  # kiosk on tty1 after reboot"
fi
if [[ "$QUIET_BOOT_VALUE" -eq 0 ]]; then
  echo ""
  echo " Quiet boot (hide splash + boot text):"
  echo "   sudo $INSTALL_DIR/scripts/quiet-boot.sh enable && sudo reboot"
fi
echo ""
echo " Re-run / update:"
echo "   curl -fsSL $INSTALL_SCRIPT_URL | sudo bash"
echo "════════════════════════════════════════════════════════════"

if [[ "$SKIP_KIOSK" -eq 0 ]]; then
  systemctl start homelabos-kiosk.service 2>/dev/null || true
fi
