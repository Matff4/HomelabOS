#!/usr/bin/env bash
# Hide Raspberry Pi boot splash and reduce boot messages on the display.
# Usage: sudo quiet-boot.sh {enable|disable|status}
set -euo pipefail

CONFIG_PATHS=(/boot/firmware/config.txt /boot/config.txt)
CMDLINE_PATHS=(/boot/firmware/cmdline.txt /boot/cmdline.txt)
SYSTEMD_DROPIN="/etc/systemd/system.conf.d/homelabos-quiet-boot.conf"
STATE_FILE="${HOMELABOS_INSTALL_DIR:-/opt/homelabos}/.env"

CMDLINE_FLAGS=(quiet loglevel=3 logo.nologo vt.global_cursor_default=0)

usage() {
  cat <<EOF
HomelabOS quiet boot — hide Pi splash and boot text on the display.

  sudo $0 enable     Apply quiet boot settings (reboot required)
  sudo $0 disable    Restore default boot verbosity (reboot required)
  sudo $0 status     Show current settings

Install with quiet boot:
  curl -fsSL .../install.sh | sudo bash -s -- --quiet-boot
EOF
}

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "ERROR: Run with sudo." >&2
    exit 1
  fi
}

find_boot_file() {
  local name=$1
  shift
  local paths=("$@")
  local p
  for p in "${paths[@]}"; do
    [[ -f "$p" ]] && { echo "$p"; return 0; }
  done
  return 1
}

set_config_splash() {
  local value=$1
  local file
  for file in "${CONFIG_PATHS[@]}"; do
    [[ -f "$file" ]] || continue
    if grep -q '^disable_splash=' "$file"; then
      sed -i "s/^disable_splash=.*/disable_splash=${value}/" "$file"
    else
      echo "disable_splash=${value}" >> "$file"
    fi
    echo "  $file → disable_splash=${value}"
  done
}

cmdline_has_flag() {
  local line=$1 flag=$2
  [[ " $line " == *" $flag "* ]]
}

enable_cmdline() {
  local file line flag changed=0
  for file in "${CMDLINE_PATHS[@]}"; do
    [[ -f "$file" ]] || continue
    line="$(tr -d '\n' < "$file")"
    for flag in "${CMDLINE_FLAGS[@]}"; do
      if ! cmdline_has_flag "$line" "$flag"; then
        line="$line $flag"
        changed=1
      fi
    done
    if [[ "$changed" -eq 1 ]]; then
      echo "$line" > "$file"
      echo "  $file → added quiet boot flags"
    else
      echo "  $file → flags already present"
    fi
  done
}

disable_cmdline() {
  local file line new_line flag
  for file in "${CMDLINE_PATHS[@]}"; do
    [[ -f "$file" ]] || continue
    line="$(tr -d '\n' < "$file")"
    new_line="$line"
    for flag in "${CMDLINE_FLAGS[@]}"; do
      new_line="${new_line// $flag/}"
      new_line="${new_line//$flag /}"
      new_line="${new_line//$flag/}"
    done
    new_line="$(echo "$new_line" | xargs)"
    if [[ "$new_line" != "$line" ]]; then
      echo "$new_line" > "$file"
      echo "  $file → removed quiet boot flags"
    fi
  done
}

enable_systemd() {
  mkdir -p "$(dirname "$SYSTEMD_DROPIN")"
  cat > "$SYSTEMD_DROPIN" <<'EOF'
# HomelabOS — hide systemd status text during boot
[Manager]
ShowStatus=no
EOF
  echo "  $SYSTEMD_DROPIN → ShowStatus=no"
}

disable_systemd() {
  if [[ -f "$SYSTEMD_DROPIN" ]]; then
    rm -f "$SYSTEMD_DROPIN"
    echo "  removed $SYSTEMD_DROPIN"
  fi
}

set_env_flag() {
  local value=$1
  if [[ ! -f "$STATE_FILE" ]]; then
    echo "HOMELABOS_QUIET_BOOT=${value}" >> "$STATE_FILE"
    return
  fi
  if grep -q '^HOMELABOS_QUIET_BOOT=' "$STATE_FILE"; then
    sed -i "s/^HOMELABOS_QUIET_BOOT=.*/HOMELABOS_QUIET_BOOT=${value}/" "$STATE_FILE"
  else
    echo "HOMELABOS_QUIET_BOOT=${value}" >> "$STATE_FILE"
  fi
}

cmd_enable() {
  require_root
  echo "==> Enabling quiet boot..."
  set_config_splash 1
  enable_cmdline
  enable_systemd
  set_env_flag 1
  echo ""
  echo "Done. Reboot for changes to take effect: sudo reboot"
}

cmd_disable() {
  require_root
  echo "==> Disabling quiet boot..."
  set_config_splash 0
  disable_cmdline
  disable_systemd
  set_env_flag 0
  echo ""
  echo "Done. Reboot for changes to take effect: sudo reboot"
}

cmd_status() {
  echo "Quiet boot status:"
  local file
  for file in "${CONFIG_PATHS[@]}"; do
    [[ -f "$file" ]] || continue
    grep '^disable_splash=' "$file" 2>/dev/null || echo "  $file: disable_splash not set"
  done
  for file in "${CMDLINE_PATHS[@]}"; do
    [[ -f "$file" ]] || continue
    echo "  cmdline ($file):"
    tr -d '\n' < "$file"
    echo ""
  done
  if [[ -f "$SYSTEMD_DROPIN" ]]; then
    echo "  systemd drop-in: present"
  else
    echo "  systemd drop-in: absent"
  fi
  if [[ -f "$STATE_FILE" ]] && grep -q '^HOMELABOS_QUIET_BOOT=1' "$STATE_FILE"; then
    echo "  HomelabOS .env: enabled"
  else
    echo "  HomelabOS .env: disabled or not set"
  fi
}

case "${1:-status}" in
  enable)  cmd_enable ;;
  disable) cmd_disable ;;
  status)  cmd_status ;;
  -h|--help) usage ;;
  *) echo "Unknown command: $1"; usage; exit 1 ;;
esac
