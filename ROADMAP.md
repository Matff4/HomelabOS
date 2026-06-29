# HomelabOS v2 — Roadmap

> v1 (PoC) lives in `old/` for reference only. No backward compatibility.

## Vision

Kiosk-first dashboard runtime for embedded Linux (Raspberry Pi + Chromium + Wayland).
Plugins are self-contained bundles. Core is the platform. JSON on disk for persistence.

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
├── old/                  # v1 PoC (reference only)
└── install.sh            # Fresh Raspberry Pi OS setup
```

## Phases

### Phase 0 — Contracts
- [x] Repo restructure, install script, roadmap
- [ ] Pydantic models + JSON schemas (manifest, layout, config)
- [ ] Frozen core API + SDK surface

### Phase 1 — Core (~1 week)
- FastAPI app factory + lifespan
- JSON store (atomic write, Pydantic validation)
- Plugin loader (manifest scan, lifespan routers)
- Event bus (SSE, heartbeat, `system.stats` channel)
- HAL (gpiozero + mock for `HOMELABOS_DEV=1`)
- Routes: health, system, config, layout, events, plugins
- pytest from day one

### Phase 2 — Shell (~1–2 weeks)
- Vite + TypeScript
- **Single SSE connection** → postMessage relay to widget iframes
- GridStack workspace (multi-pane, edit mode)
- Taskbar via SSE (no polling)
- Modals: settings, power, confirm, widget config
- Display-aware grid geometry

### Phase 3 — SDK + Plugin Template (~3–4 days)
- `homelabos-sdk` package
- `scripts/create-plugin.py` scaffold
- Plugin author docs

### Phase 4 — Rewrite Plugins (~1 week)
| v1 reference | v2 plugin |
|--------------|-----------|
| `old/backend/apps/pve-integration/` | `apps/pve/` |
| `old/backend/apps/active-cooling/` | `apps/fan/` |
| demo/power widgets | examples or drop |

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

```ts
HomelabOS.version
HomelabOS.platform          // { kiosk, theme, accent }
HomelabOS.fetch(url, opts)
HomelabOS.subscribe(ch, fn) // parent relay in iframes
HomelabOS.config            // get / set instance config
HomelabOS.settings          // widget settings schema flow
```

## Sprint 1 (current)

1. Scaffold repo ✓
2. Install script for fresh Pi OS ✓
3. Minimal bootable core (health + static shell placeholder)
4. JSON schemas
5. Dev mode on laptop (`HOMELABOS_DEV=1`)

## v2 Performance Goals (fix v1 pane scroll lag)

- Replace CSS `scroll-behavior: smooth` pane carousel with `transform`/`translateX`
- One SSE connection in shell (not per iframe)
- Pause or detach off-screen widget iframes
- Remove `backdrop-filter: blur()` on taskbar in kiosk mode
- Use `content-visibility: auto` on off-screen panes
