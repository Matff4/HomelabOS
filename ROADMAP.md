# HomelabOS — Roadmap

## Vision

A kiosk dashboard on Raspberry Pi for **monitoring your homelab** — Proxmox nodes, services, sensors, and anything else via plugins.

Runs on embedded Linux (Pi + Chromium + Cage). **HomelabOS is the platform**; plugins ship separately in **[HomelabOS-Plugins](https://github.com/Matff4/HomelabOS-Plugins)** (planned) and install via an in-shell store. JSON on disk for persistence.

## Repository layout

```
homelabos/                    # Platform (this repo)
├── core/                     # Python platform (FastAPI)
├── shell/                    # TypeScript kiosk UI (Vite)
├── sdk/                      # Plugin SDK (built → shell/dist/sdk/)
├── apps/demo/                # Reference plugin only (bundled)
├── schemas/                  # JSON Schema for manifest, layout, config
├── data/                     # Runtime JSON (gitignored contents)
├── scripts/                  # install.sh, dev helpers, systemd templates
└── install.sh

homelabos-plugins/            # Separate repo (planned)
├── index.json                # Marketplace catalog
├── plugins/                  # Plugin packages (pve, fan, esxi, …)
└── .github/workflows/        # Manifest validation + release tarballs
```

## Strategy

1. **Finish the platform** (shell, SDK docs, install/update API, store UI).
2. **Ship the ecosystem repo** with a catalog + at least one real plugin.
3. **Build rich integrations** (PVE, ESXi, GPIO, …) only as store plugins — not inside core.

Core stays stable; plugins move fast without breaking the kiosk.

---

## Phases

### Phase 0 — Contracts ✅
- [x] Repo restructure, install script, roadmap
- [x] Pydantic models + JSON schemas — `core/models/`, `docs/CONTRACTS.md`
- [x] Frozen core API + SDK surface — `docs/CONTRACTS.md`, `sdk/src/types.ts`
- [x] Regenerate schemas: `python scripts/generate_schemas.py`

### Phase 0.5 — Platform bootstrap ✅
- [x] Resumable `install.sh` + `homelabos-update`
- [x] Cage + Chromium kiosk, quiet boot, optional wayvnc dev mirror
- [x] Minimal bootable core (`GET /api/health` + shell)

### Phase 1 — Core ✅
- [x] FastAPI app factory + lifespan
- [x] JSON store (atomic write, Pydantic validation)
- [x] Plugin loader (manifest scan, lifespan routers)
- [x] Event bus (SSE, heartbeat, `system.stats`, `system.display`)
- [x] HAL (gpiozero + mock for dev)
- [x] Routes: health, system, config, layout, events, plugins, components
- [x] pytest from day one

### Phase 2 — Shell ✅
- [x] Vite + TypeScript shell (taskbar, workspace)
- [x] Single SSE connection → postMessage relay to widget iframes
- [x] Taskbar via SSE (stats, clock, icon controls)
- [x] GridStack workspace (drag/resize, float layout, persist to `/api/layout`)
- [x] Display-aware grid (physical panel → row/col capacity; browser → tile pixel size)
- [x] Modals: settings, power, confirm, app drawer
- [x] Widget chrome (title bar, configure, remove in edit mode)
- [x] Widget config modal (`PATCH /api/layout/widget`, JSON editor)
- [ ] Multi-pane carousel (deferred — layout model supports `pane`, shell uses pane 0 only)

### Phase 3 — SDK + plugin author tooling (~3–4 days) ← **current**
- [x] `homelabos-sdk` browser package (subscribe, getConfig, saveConfig)
- [ ] `docs/PLUGIN_AUTHOR.md` (manifest, routes, SDK, config, testing on Pi)
- [ ] `scripts/create-plugin.py` scaffold
- [ ] Document `api_version` compatibility rules in CONTRACTS
- [ ] Optional: `REQUEST_SETTINGS` / `SETTINGS_SCHEMA` iframe protocol (v1 parity)

### Phase 4 — Plugin platform (~1 week)
- [ ] `data/registry.json` — installed plugin metadata
- [ ] `apps/` (bundled demo) + `data/plugins/` (user-installed)
- [ ] Implement `POST /api/plugins/install` (tarball URL → extract → register)
- [ ] Implement `POST /api/plugins/{id}/update` and `DELETE /api/plugins/{id}`
- [ ] `api_version` + HomelabOS version checks on install
- [ ] Service reload strategy documented (restart vs hot-mount)

### Phase 5 — Marketplace UI (~1 week)
- [ ] Default `marketplaceUrl` → HomelabOS-Plugins `index.json`
- [ ] Shell store: browse catalog, install, list installed, update available
- [ ] Settings: configure marketplace URL
- [ ] HomelabOS-Plugins repo v0.1 (catalog + one non-demo plugin)

### Phase 6 — Plugin content (ongoing, in HomelabOS-Plugins)
- [ ] Reference plugin beyond demo (e.g. simple GPIO or read-only PVE)
- [ ] PVE integration (full)
- [ ] ESXi, fan control, and community plugins
- **Not in core** — each plugin has its own release cycle

### Phase 7 — Production hardening
- [ ] systemd ordering, Chromium crash recovery
- [ ] Fast service restart (SSE graceful shutdown) ✅
- [ ] `data/` backup tarball
- [ ] Pre-baked image deps (no runtime pip on device)
- [ ] Performance: off-screen iframe detach, kiosk taskbar blur removal

---

## Core API

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
PATCH /api/layout/widget            { "instance_id", "config" }

GET  /api/components                Flattened manifest components (shell drawer)
GET  /api/events                    SSE (shell only)

GET  /api/plugins
GET  /api/plugins/{id}/health
POST /api/plugins/install           Phase 4
POST /api/plugins/{id}/update       Phase 4
DELETE /api/plugins/{id}            Phase 4

/api/plugins/{id}/*                 Plugin backend routes
/apps/{plugin_id}/…                 Plugin static assets
```

## SDK surface

Implemented in `sdk/src/`; types frozen in `docs/CONTRACTS.md`.

```ts
HomelabOS.version / .platform
HomelabOS.fetch(url, opts)
HomelabOS.subscribe(channel, fn)
HomelabOS.getConfig() / .saveConfig(obj)
```

## Current sprint

**Phase 2 closed.** Next up:

1. Phase 3 — plugin author docs + `create-plugin.py`
2. Phase 4 — install/update API + registry
3. Phase 5 — shell store + HomelabOS-Plugins repo bootstrap

## Performance goals (Phase 7)

- Replace CSS pane carousel with `transform`/`translateX` when multi-pane ships
- One SSE connection in shell (done)
- Pause or detach off-screen widget iframes
- Remove `backdrop-filter: blur()` on taskbar in kiosk mode
- `content-visibility: auto` on off-screen panes
