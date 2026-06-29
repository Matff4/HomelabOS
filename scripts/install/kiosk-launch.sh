#!/usr/bin/env bash
# Launch Chromium in kiosk mode inside Cage (single-app Wayland compositor)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${HOMELABOS_INSTALL_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
URL="${HOMELABOS_URL:-http://127.0.0.1:8000/?kiosk=true}"
API_WAIT="${HOMELABOS_API_WAIT:-http://127.0.0.1:8000/api/health}"

if [[ -f "$INSTALL_DIR/.env" ]]; then
  # shellcheck disable=SC1090
  source "$INSTALL_DIR/.env" 2>/dev/null || true
fi

echo "Waiting for HomelabOS API..."
until curl -sf "$API_WAIT" >/dev/null 2>&1; do
  sleep 1
done

CHROMIUM=""
for bin in /usr/bin/chromium /usr/bin/chromium-browser; do
  [[ -x "$bin" ]] && CHROMIUM="$bin" && break
done
[[ -n "$CHROMIUM" ]] || { echo "Chromium not found"; exit 1; }

exec "$CHROMIUM" \
  --ozone-platform=wayland \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-translate \
  --no-first-run \
  --fast \
  --fast-start \
  --disable-features=TranslateUI \
  --disk-cache-size=1 \
  --media-cache-size=1 \
  --enable-features=OverlayScrollbar \
  --touch-events=enabled \
  --app="$URL"
