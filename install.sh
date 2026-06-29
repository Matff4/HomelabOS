#!/usr/bin/env bash
# HomelabOS v2 — Raspberry Pi OS (64-bit) installer
#
# One-liner (fresh Pi, no git clone needed):
#   curl -fsSL https://raw.githubusercontent.com/Matff4/HomelabOS/main/install.sh | sudo bash
#
# From a local clone (developer):
#   sudo bash install.sh --in-place
#
set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
INSTALL_DIR="/opt/homelabos"
REPO_URL="${HOMELABOS_REPO:-https://github.com/Matff4/HomelabOS.git}"
REPO_BRANCH="${HOMELABOS_BRANCH:-main}"

IN_PLACE=0
SKIP_KIOSK=0
SKIP_BUILD=0
SERVICE_USER=""   # auto-detected from $SUDO_USER

# ── Parse args ────────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --in-place)   IN_PLACE=1 ;;
    --user)       SERVICE_USER="$2"; shift ;;   # override auto-detect (rare)
    --dir)        INSTALL_DIR="$2"; shift ;;
    --branch)     REPO_BRANCH="$2"; shift ;;
    --repo)       REPO_URL="$2"; shift ;;
    --skip-kiosk) SKIP_KIOSK=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    -h|--help)
      cat <<'EOF'
HomelabOS v2 installer

Recommended (fresh Raspberry Pi OS, user created via Pi Imager):
  curl -fsSL https://raw.githubusercontent.com/Matff4/HomelabOS/main/install.sh | sudo bash

Clones the repo to /opt/homelabos and runs services as the user who invoked sudo.

Developer options:
  sudo bash install.sh --in-place     Install from current clone without copying to /opt
  sudo bash install.sh --skip-kiosk   API only, no Cage/Chromium kiosk
  sudo bash install.sh --skip-build   Skip npm shell build
  sudo bash install.sh --branch dev   Clone a different branch (remote install only)

Environment overrides:
  HOMELABOS_REPO=...    Git remote URL
  HOMELABOS_BRANCH=...  Branch to clone (default: main)
EOF
      exit 0
      ;;
    *) echo "Unknown option: $1 (try --help)"; exit 1 ;;
  esac
  shift
done

# ── Detect install mode ───────────────────────────────────────────────────────
# Remote/piped: curl | sudo bash  →  clone repo ourselves
# Local: sudo bash install.sh from a checkout
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

# ── Preflight ─────────────────────────────────────────────────────────────────
if [[ "${EUID}" -ne 0 ]]; then
  echo "ERROR: Run with sudo (root login is disabled on Raspberry Pi OS by default)."
  echo "  curl -fsSL https://raw.githubusercontent.com/Matff4/HomelabOS/main/install.sh | sudo bash"
  exit 1
fi

ARCH="$(uname -m)"

# ── Detect service user (Pi Imager creates this account) ──────────────────────
detect_service_user() {
  if [[ -n "$SERVICE_USER" ]]; then
    echo "$SERVICE_USER"
    return
  fi
  if [[ -n "${SUDO_USER:-}" && "$SUDO_USER" != "root" ]]; then
    echo "$SUDO_USER"
    return
  fi
  # Fallback: first normal login user
  local u
  u="$(getent passwd | awk -F: '$3 >= 1000 && $3 < 65534 && $7 !~ /nologin|false/ { print $1; exit }')"
  if [[ -n "$u" ]]; then
    echo "$u"
    return
  fi
  echo "ERROR: Could not detect a user account." >&2
  echo "  Create one with Raspberry Pi Imager, then run:" >&2
  echo "  curl -fsSL https://raw.githubusercontent.com/Matff4/HomelabOS/main/install.sh | sudo bash" >&2
  exit 1
}

SERVICE_USER="$(detect_service_user)"

if ! id "$SERVICE_USER" &>/dev/null; then
  echo "ERROR: User '$SERVICE_USER' does not exist."
  exit 1
fi

SERVICE_UID="$(id -u "$SERVICE_USER")"

echo "==> HomelabOS v2 installer"
echo "    arch : $ARCH"
echo "    user : $SERVICE_USER (uid $SERVICE_UID)"
echo "    target: $INSTALL_DIR"

# ── System packages (git first — needed for remote clone) ─────────────────────
echo "==> Installing system packages..."
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

if ! command -v node >/dev/null 2>&1; then
  echo "==> Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

HARDWARE_EXTRAS=""
if [[ "$ARCH" == "aarch64" || "$ARCH" == "armv7l" ]]; then
  apt-get install -y --no-install-recommends python3-lgpio || true
  HARDWARE_EXTRAS="gpiozero"
fi

# ── Service user groups ───────────────────────────────────────────────────────
for grp in video input render gpio i2c spi; do
  getent group "$grp" >/dev/null && usermod -aG "$grp" "$SERVICE_USER" || true
done

systemctl enable --now seatd.service

# ── Deploy application ────────────────────────────────────────────────────────
if [[ "$is_local_checkout" -eq 1 && "$IN_PLACE" -eq 1 ]]; then
  echo "==> Using local checkout in place: $INSTALL_DIR"
elif [[ "$is_local_checkout" -eq 1 ]]; then
  echo "==> Copying local checkout to $INSTALL_DIR"
  mkdir -p "$INSTALL_DIR"
  rsync -a --delete \
    --exclude '.git' --exclude 'old/.venv' --exclude 'node_modules' \
    --exclude '.venv' --exclude 'shell/dist' --exclude 'data/*.json' \
    "$LOCAL_REPO/" "$INSTALL_DIR/"
else
  echo "==> Cloning $REPO_URL (branch: $REPO_BRANCH) → $INSTALL_DIR"
  if [[ -d "$INSTALL_DIR/.git" ]]; then
    echo "    Existing install found — updating..."
    git -C "$INSTALL_DIR" fetch origin "$REPO_BRANCH"
    git -C "$INSTALL_DIR" reset --hard "origin/$REPO_BRANCH"
  else
    rm -rf "$INSTALL_DIR"
    git clone --depth 1 --branch "$REPO_BRANCH" "$REPO_URL" "$INSTALL_DIR"
  fi
fi

if [[ ! -f "$INSTALL_DIR/core/app.py" ]]; then
  echo "ERROR: Deploy failed — core/app.py missing in $INSTALL_DIR"
  exit 1
fi

mkdir -p "$INSTALL_DIR/data" "$INSTALL_DIR/data/plugins"
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"

# ── Python environment ────────────────────────────────────────────────────────
echo "==> Setting up Python virtualenv..."
if [[ ! -d "$INSTALL_DIR/.venv" ]]; then
  sudo -u "$SERVICE_USER" python3 -m venv "$INSTALL_DIR/.venv"
fi
sudo -u "$SERVICE_USER" "$INSTALL_DIR/.venv/bin/pip" install --upgrade pip wheel
sudo -u "$SERVICE_USER" "$INSTALL_DIR/.venv/bin/pip" install -r "$INSTALL_DIR/requirements.txt"
if [[ -n "$HARDWARE_EXTRAS" ]]; then
  sudo -u "$SERVICE_USER" "$INSTALL_DIR/.venv/bin/pip" install $HARDWARE_EXTRAS
fi

# ── Build frontend ────────────────────────────────────────────────────────────
if [[ "$SKIP_BUILD" -eq 0 ]] && command -v npm >/dev/null 2>&1; then
  echo "==> Building shell..."
  sudo -u "$SERVICE_USER" bash -c "cd '$INSTALL_DIR/shell' && (npm ci || npm install) && npm run build"
else
  echo "==> Skipping shell build"
fi

# ── Environment file ──────────────────────────────────────────────────────────
ENV_FILE="$INSTALL_DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  cat > "$ENV_FILE" <<EOF
HOMELABOS_DEV=0
HOMELABOS_HOST=127.0.0.1
HOMELABOS_PORT=8000
HOMELABOS_INSTALL_DIR=$INSTALL_DIR
EOF
  chown "$SERVICE_USER:$SERVICE_USER" "$ENV_FILE"
  chmod 640 "$ENV_FILE"
else
  grep -q "^HOMELABOS_INSTALL_DIR=" "$ENV_FILE" || \
    echo "HOMELABOS_INSTALL_DIR=$INSTALL_DIR" >> "$ENV_FILE"
fi

# ── systemd: homelabos.service ────────────────────────────────────────────────
echo "==> Installing systemd units..."
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

# ── Kiosk (Cage + Chromium) ───────────────────────────────────────────────────
if [[ "$SKIP_KIOSK" -eq 0 ]]; then
  install -o "$SERVICE_USER" -g "$SERVICE_USER" -m 755 \
    "$INSTALL_DIR/scripts/install/kiosk-launch.sh" \
    "$INSTALL_DIR/scripts/kiosk-launch.sh"

  # Wayland runtime dir for kiosk session on tty1 (no desktop login)
  loginctl enable-linger "$SERVICE_USER" 2>/dev/null || true

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
fi

# ── sudoers for power actions ─────────────────────────────────────────────────
SUDOERS_FILE="/etc/sudoers.d/homelabos"
cat > "$SUDOERS_FILE" <<EOF
# HomelabOS — power management for $SERVICE_USER
$SERVICE_USER ALL=(root) NOPASSWD: /sbin/reboot, /sbin/shutdown, /bin/systemctl restart homelabos-kiosk.service
EOF
chmod 440 "$SUDOERS_FILE"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════"
echo " HomelabOS v2 installed successfully"
echo "════════════════════════════════════════════════════════════"
echo " Install dir : $INSTALL_DIR"
echo " Service user: $SERVICE_USER"
echo " API         : http://127.0.0.1:8000/api/health"
echo ""
echo " Commands:"
echo "   systemctl status homelabos"
echo "   journalctl -u homelabos -f"
if [[ "$SKIP_KIOSK" -eq 0 ]]; then
  echo "   sudo systemctl start homelabos-kiosk   # start kiosk now"
  echo "   sudo reboot                            # kiosk starts on boot"
fi
echo ""
echo " Re-install / update:"
echo "   curl -fsSL https://raw.githubusercontent.com/Matff4/HomelabOS/main/install.sh | sudo bash"
echo "════════════════════════════════════════════════════════════"

if [[ "$SKIP_KIOSK" -eq 0 ]]; then
  systemctl start homelabos-kiosk.service 2>/dev/null || true
fi
