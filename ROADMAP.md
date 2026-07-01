# HomelabOS — Roadmap

## Vision

A kiosk dashboard on Raspberry Pi for **monitoring your homelab** — Proxmox nodes, services, sensors, and anything else via plugins.

Runs on embedded Linux (Pi + Chromium + Cage). **HomelabOS is the platform**; plugins ship separately in **[HomelabOS-Plugins](https://github.com/Matff4/HomelabOS-Plugins)** and install via an in-shell store. JSON on disk for persistence.

## Repository layout

```
homelabos/                    # Platform (this repo)
├── core/                     # Python platform (FastAPI)
├── shell/                    # TypeScript kiosk UI (Vite)
├── sdk/                      # Plugin SDK (built → shell/dist/sdk/)
├── apps/demo-widget/         # Reference widget plugin (bundled)
├── apps/demo-buttons/        # Reference action plugin — momentary + toggle
├── apps/demo-app/            # Reference fullscreen app plugin
├── apps/demo/                # Legacy reference (hidden from store/drawer)
├── schemas/                  # JSON Schema for manifest, layout, config
├── data/                     # Runtime JSON (gitignored contents)
├── scripts/                  # install.sh, dev helpers, systemd templates
└── install.sh

homelabos-plugins/            # Separate repo
├── index.json                # Marketplace catalog
├── plugins/                  # Plugin packages (pve, fan, esxi, …)
└── .github/workflows/        # Manifest validation + release tarballs
```

## Strategy

1. **Stabilize the platform** (contracts, compatibility, panes, polish).
2. **Ship the ecosystem repo** with a catalog + real plugins.
3. **Build rich integrations** (PVE, ESXi, GPIO, …) only as store plugins — not inside core.

Core stays stable; plugins move fast without breaking the kiosk.

**HomelabOS 1.0.x policy:** `manifest.api_version: 1` + SDK + postMessage + `/api/components` are frozen. Breaking changes require HomelabOS 2.0 and `api_version: 2`.

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
- [x] Square tiles + inter-widget gaps (GridStack tile margin, display-verified)
- [x] Modals: settings, power, confirm, app drawer
- [x] Widget chrome (title bar, manifest-based settings form, remove in edit mode)
- [x] Multi-pane carousel (`pane` in layout + `paneCount` in config, swipe + taskbar nav)

### Phase 3 — SDK + plugin author tooling ✅
- [x] `homelabos-sdk` browser package (subscribe, getConfig, saveConfig)
- [x] `docs/PLUGIN_AUTHOR.md` (manifest, routes, SDK, config, testing on Pi)
- [x] `scripts/create-plugin.py` scaffold
- [x] Document `api_version` compatibility rules in CONTRACTS
- [x] SDK exposes `platform.coreVersion`, `pluginApiVersion`, `sdkVersion` via iframe query params

### Phase 4 — Plugin platform ✅
- [x] `data/registry.json` — installed plugin metadata
- [x] `apps/` (bundled demo) + `data/plugins/` (user-installed)
- [x] Implement `POST /api/plugins/install` (tarball URL → extract → register)
- [x] Implement `POST /api/plugins/{id}/update` and `DELETE /api/plugins/{id}`
- [x] `api_version` + HomelabOS version checks on install
- [x] Hot-load static assets + backend routes after install (no restart)

### Phase 5 — Marketplace UI ✅
- [x] Default `marketplaceUrl` → HomelabOS-Plugins `index.json`
- [x] Shell store: browse catalog, install, list installed, update available
- [x] Settings: configure marketplace URL
- [x] Catalog schema + docs (`docs/MARKETPLACE.md`) for HomelabOS-Plugins repo bootstrap
- [x] Toast notifications for install/update/remove

### Phase 5.5 — Core stabilization ✅ ← **complete**
- [x] `GET /api/platform` — core, SDK, and supported manifest api versions
- [x] Boot-time compatibility re-check (`requires.core`, `api_version`) — disable incompatible plugins
- [x] Incompatible plugins visible in store (Installed tab) but excluded from widget drawer
- [x] Demo plugin hidden from store list and widget drawer (assets remain for legacy layouts)
- [x] Orphan/unavailable widget placeholders when component missing
- [x] Contract tests (`tests/test_contracts.py`) for platform, postMessage types, SSE channels
- [x] Compatibility tests (`tests/test_compatibility.py`)
- [x] `GET /api/system/backup` + `scripts/backup-data.py`
- [x] HomelabOS 1.0.x no-breaking-changes policy documented above

### Phase 6 — Plugin content (next) ← **current**
- [x] HomelabOS-Plugins repo v0.1 — catalog + **uptime** widget
- [x] Bundled reference plugins: `demo-widget`, `demo-buttons` (momentary + toggle), `demo-app`
- [ ] Reference plugin beyond demo (GPIO, read-only PVE, …)
- [ ] PVE integration (full)
- [ ] ESXi, fan control, and community plugins
- **Not in core** — each plugin has its own release cycle

### Phase 7 — Production hardening
- [ ] systemd ordering, Chromium crash recovery
- [x] Fast service restart (SSE graceful shutdown)
- [x] `data/` backup tarball
- [ ] Pre-baked image deps (no runtime pip on device)
- [ ] Performance: off-screen iframe detach, kiosk taskbar blur removal
- [ ] Optional taskbar-pinned action buttons (grid shortcuts remain default)

### Phase 8 — Screensaver & display power (planned)

Idle display management for 24/7 kiosk panels — reduce burn-in, power, and backlight wear without losing instant wake on touch.

- [ ] **DDC/CI autodiscovery** — probe HDMI-attached displays over I²C (built into many panels); detect VCP feature support (power, backlight, contrast)
- [ ] **Display power off** — on idle timeout, send DDC/CI `VCP 0xD6` (power mode: off) when supported; fall back to shell blank overlay when not
- [ ] **Wake on touch** — any pointer/keyboard activity dismisses screensaver and restores prior power/backlight state
- [ ] **Gradual dimming** — idle stages: normal → dimmed backlight (DDC/CI `0x10`) → blank overlay → display off
- [ ] **Configurable idle timeout** — per-device setting in config (minutes); optional night schedule (e.g. force off 23:00–07:00)
- [ ] **Burn-in mitigation** — optional pixel-shift or subtle UI drift while idle (before full off)
- [ ] **Per-display profiles** — remember discovered EDID/DDC capabilities in `data/display-profiles.json`
- [ ] **Manual override** — taskbar quick action: dim / off / wake; respect override until next idle cycle
- [ ] **QoL** — show clock on dimmed overlay; suppress widget SSE relay while fully off; restore layout without reload

Implementation notes: Linux `ddcutil` or direct `/dev/i2c-*` on Pi HDMI; HAL service in core; shell idle timer + fullscreen screensaver layer; settings UI in power modal.

---

## Core API

Frozen request/response shapes: **[docs/CONTRACTS.md](docs/CONTRACTS.md)**.

```
GET  /api/health
GET  /api/platform                 core + SDK + supported api versions
GET  /api/system/stats
GET  /api/system/display
GET  /api/system/backup            data/ tarball download
POST /api/system/power              { "action": "reboot"|"shutdown"|"restart-kiosk" }

GET  /api/config
PUT  /api/config                    includes paneCount (1–8)

GET  /api/layout
PUT  /api/layout
PATCH /api/layout/widget            { "instance_id", "config" }

GET  /api/components                enabled plugins only (no hidden demo)
GET  /api/events                    SSE (shell only)

GET  /api/plugins                   user + non-hidden plugins; enabled flag
GET  /api/plugins/{id}/health
POST /api/plugins/install
POST /api/plugins/{id}/update
DELETE /api/plugins/{id}

GET  /api/marketplace/catalog

/api/plugins/{id}/*                 Plugin backend routes
/apps/{plugin_id}/…                 Plugin static assets
```

## SDK surface

```ts
HomelabOS.version / .platform   // includes coreVersion, pluginApiVersion, sdkVersion
HomelabOS.fetch(url, opts)
HomelabOS.subscribe(channel, fn)
HomelabOS.getConfig() / .saveConfig(obj)
HomelabOS.closeApp()            // fullscreen apps
```

## Current sprint

**Phase 5.5 complete** — platform contracts enforced, demo hidden, panes live, backup available.

**Next: Phase 6** — real plugins in [HomelabOS-Plugins](https://github.com/Matff4/HomelabOS-Plugins) once you're ready to build content on this foundation.

## Performance goals (Phase 7)

- One SSE connection in shell (done)
- Pause or detach off-screen widget iframes (multi-pane: inactive panes)
- Remove `backdrop-filter: blur()` on taskbar in kiosk mode
- `content-visibility: auto` on off-screen panes
