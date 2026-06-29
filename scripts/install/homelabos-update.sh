#!/usr/bin/env bash
# Re-run the HomelabOS installer from GitHub (safe to run anytime).
#
#   homelabos-update
#   homelabos-update --quiet-boot
#   homelabos-update --dev-vnc
set -euo pipefail

INSTALL_SCRIPT_URL="https://raw.githubusercontent.com/Matff4/HomelabOS/refs/heads/master/install.sh"
SELF="/usr/local/bin/homelabos-update"

if [[ "${EUID}" -ne 0 ]]; then
  exec sudo "$SELF" "$@"
fi

curl -fsSL "$INSTALL_SCRIPT_URL" | bash -s -- "$@"
