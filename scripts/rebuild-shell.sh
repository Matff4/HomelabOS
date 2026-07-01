#!/usr/bin/env bash
# Rebuild the kiosk shell bundle (required after shell/src changes).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/shell"
npm ci 2>/dev/null || npm install
npm run build
echo "Shell built → $ROOT/shell/dist (layout: grid-launchers-v2)"
