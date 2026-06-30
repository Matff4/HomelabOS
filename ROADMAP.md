# HomelabOS — Roadmap

## Vision

A kiosk dashboard on Raspberry Pi for **monitoring your homelab** — Proxmox nodes, services, sensors, and anything else via plugins.

Runs on embedded Linux (Pi + Chromium + Cage). Plugins are self-contained bundles. Core is the platform. JSON on disk for persistence.

## Repository Layout

```
homelabos/
├── core/                 # Python platform (FastAPI)
├── shell/                # TypeScript kiosk UI (Vite)
├── sdk/                  # Plugin SDK (built → shell/dist/sdk/)
├── apps/                 # Bundled plugins
├── schemas/              # JSON Schema for manifest, layout, config
├── data/                 # Runtime JSON (gitignored contents)
├── scripts/              # install.sh, dev helpers, systemd templates
└── install.sh            # Fresh Raspberry Pi OS setup
```

## Phases

### Phase 0 — Contracts
- [x] Repo restructure, install script, roadmap
- [x] Pydantic models + JSON schemas (manifest, layout, config) — see `core/models/`, `docs/CONTRACTS.md`
- [x] Frozen core API + SDK surface — `docs/CONTRACTS.md`, `sdk/src/types.ts`
- [x] Regenerate schemas: `python scripts/generate_schemas.py`

### Phase 0.5 — Platform bootstrap (done)
- [x] Resumable `install.sh` + `homelabos-update`
- [x] Cage + Chromium kiosk, quiet boot, optional wayvnc dev mirror
- [x] Minimal bootable core (`GET /api/health` + shell placeholder)

### Phase 1 — Core (~1 week)
- [x] FastAPI app factory + lifespan
- [x] JSON store (atomic write, Pydantic validation)
- [x] Plugin loader (manifest scan, lifespan routers)
- [x] Event bus (SSE, heartbeat, `system.stats` channel)
- [x] HAL (gpiozero + mock for `HOMELABOS_DEV=1`)
- [x] Routes: health, system, config, layout, events, plugins
- [x] pytest from day one

### Phase 2 — Shell (~1–2 weeks)
- [x] Vite + TypeScript (initial shell — taskbar, workspace, demo widget)
- [x] Single SSE connection → postMessage relay to widget iframes
- [ ] GridStack workspace (multi-pane, edit mode) — single pane + edit mode sketch
- [x] Taskbar via SSE (no polling)
- [ ] Modals: settings, power, confirm, widget config
- [x] Display-aware grid geometry (basic)

### Phase 3 — SDK + Plugin Template (~3–4 days)
- `homelabos-sdk` package
- `scripts/create-plugin.py` scaffold
- Plugin author docs

### Phase 4 — Plugins (~1 week)
- `apps/pve/` — Proxmox monitoring
- `apps/fan/` — GPIO fan control
- Example widgets as needed

### Phase 5 — Plugin Platform (~1 week)
- `data/registry.json` installed metadata
- `apps/` (bundled) + `data/plugins/` (user-installed)
- Install/update API from tarball URL

### Phase 6 — Marketplace UI (~1–2 weeks)
- Remote repo `index.json` + versioned packages
- Browse / install / update from touchscreen

### Phase 7 — Production Hardening
- systemd ordering, Chromium crash recovery
- `data/` backup tarball
- Pre-baked image deps (no runtime pip on device)

## Core API (target)

Frozen request/response shapes: **[docs/CONTRACTS.md](docs/CONTRACTS.md)**.

```
GET  /api/health
GET  /api/system/stats
GET  /api/system/display
POST /api/system/power              { "action": "reboot"|"shutdown"|"restart-kiosk" }

GET  /api/config
PUT  /api/config

GET  /api/layout
PUT  /api/layout

GET  /api/events                    SSE (shell only)

GET  /api/plugins
GET  /api/plugins/{id}/health
POST /api/plugins/install
POST /api/plugins/{id}/update
DELETE /api/plugins/{id}

/api/plugins/{id}/*                 Plugin routes
```

## SDK Surface (target)

Frozen TypeScript types: `sdk/src/types.ts`. Full implementation in Phase 3.

## Sprint 1 — complete

1. Scaffold repo ✓
2. Install script for fresh Pi OS ✓
3. Minimal bootable core (health + static shell placeholder) ✓
4. JSON schemas (generated from Pydantic) ✓
5. Dev mode on laptop (`HOMELABOS_DEV=1`) ✓

**Next:** Phase 2 — shell UI (GridStack, SSE relay, taskbar).

## Performance Goals

- Replace CSS `scroll-behavior: smooth` pane carousel with `transform`/`translateX`
- One SSE connection in shell (not per iframe)
- Pause or detach off-screen widget iframes
- Remove `backdrop-filter: blur()` on taskbar in kiosk mode
- Use `content-visibility: auto` on off-screen panes
