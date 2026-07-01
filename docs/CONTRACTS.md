# HomelabOS Contracts (Phase 0 — frozen)

This document is the **stable contract** for HomelabOS 1.0.0. Phase 1+ implements these
interfaces; they should not change without a deliberate version bump.

**Source of truth for JSON shapes:** Pydantic models in `core/models/`. Regenerate JSON Schema
files with:

```bash
python scripts/generate_schemas.py
```

---

## Versioning

| Layer | Version | Location |
|-------|---------|----------|
| Core platform | `1.0.0` | `core/__init__.py`, `GET /api/health` |
| Plugin manifest API | `1` | `manifest.api_version` |
| Plugin SDK (browser) | `1.0.0` | built to `shell/dist/sdk/`, served at `/sdk/homelabos-sdk.js` |

Breaking changes require bumping the relevant version and updating this document.

### `api_version` compatibility (plugins)

| Core (`CORE_VERSION`) | Accepts `manifest.api_version` | Notes |
|-----------------------|-------------------------------|--------|
| `1.0.x` | `1` only | Validated at discovery via Pydantic `Literal[1]` |

Rules:

- **`api_version`** is the manifest/loader contract, independent of the plugin’s own `version` field.
- Core **1.0.x** loads only manifests with `api_version: 1`. Invalid manifests are skipped at discovery (logged, not fatal).
- **`requires.core`** (optional semver in manifest) is stored but **not enforced** until Phase 4 install/update.
- **Phase 4 install** will reject plugins when `api_version` exceeds `PLUGIN_API_VERSION` in `core/constants.py`.
- A future **HomelabOS 2.x** may introduce `api_version: 2` with updated manifest fields and SDK messages — ship together with a core bump.

Authoring guide: [PLUGIN_AUTHOR.md](PLUGIN_AUTHOR.md).

## Persistence

| File | Model | Description |
|------|-------|-------------|
| `data/config.json` | `SystemConfig` | Global UI preferences |
| `data/layout.json` | `Layout` (array of `LayoutItem`) | Dashboard grid |
| `apps/*/manifest.json` | `PluginManifest` | Bundled plugins |
| `data/plugins/*/manifest.json` | `PluginManifest` | User-installed plugins (Phase 5) |

All writes must be atomic (write temp → rename). Validation uses Pydantic before persist.

### Defaults

When a data file is missing, core serves model defaults (`SystemConfig()`, `[]` for layout).

---

## HTTP API

Base URL on device: `http://<pi-ip>:8000`

### Implemented (Phase 0–1)

#### `GET /api/health`

```json
{
  "status": "ok",
  "version": "1.0.0",
  "dev": false,
  "mock_hal": false,
  "time": "2026-06-11T12:00:00+00:00"
}
```

#### `GET /api/system/stats` → `SystemStats`

#### `GET /api/system/display` → `DisplayInfo`

#### `POST /api/system/power` — body `PowerRequest`

#### `GET /api/config` / `PUT /api/config` → `SystemConfig`

#### `GET /api/layout` / `PUT /api/layout` → `LayoutItem[]`

#### `PATCH /api/layout/widget` — body `WidgetConfigPatch`

#### `GET /api/events` — Server-Sent Events (see envelope below)

#### `GET /api/components` → `ComponentInfo[]`

#### `GET /api/plugins` → `PluginSummary[]`

#### `GET /api/plugins/{id}/health` → `PluginHealth`

#### `/api/plugins/{id}/*` — plugin backend routes

Plugin static assets: `/apps/{plugin_id}/…` (e.g. widget HTML).

#### `POST /api/plugins/install` — body `PluginInstallRequest`

Installs a plugin tarball into `data/plugins/` and updates `data/registry.json`. Returns:

```json
{
  "id": "my-plugin",
  "version": "1.0.0",
  "restart_required": true,
  "message": "Plugin installed. Restart homelabos.service to load backend routes."
}
```

Static assets are available after `discover()`; **backend routes require a service restart** (FastAPI mounts routers at startup).

#### `POST /api/plugins/{id}/update` — body `PluginInstallRequest`

Same response shape as install. Replaces the user-installed plugin directory.

#### `DELETE /api/plugins/{id}`

Removes a user-installed plugin from `data/plugins/`. Bundled plugins under `apps/` cannot be removed (409).

### Reference — frozen shapes

#### `GET /api/system/stats` → `SystemStats`

```json
{
  "cpu_percent": 12.5,
  "mem_used_mb": 512.0,
  "mem_total_mb": 4096.0,
  "mem_percent": 12.5,
  "uptime_seconds": 86400.0
}
```

#### `GET /api/system/display` → `DisplayInfo`

```json
{
  "width": 1424,
  "height": 280,
  "kiosk": true
}
```

#### `POST /api/system/power` — body `PowerRequest`

```json
{ "action": "reboot" }
```

Actions: `"reboot"` | `"shutdown"` | `"restart-kiosk"`.

#### `GET /api/config` → `SystemConfig`

#### `PUT /api/config` — body `SystemConfig` (full replace)

#### `GET /api/layout` → `LayoutItem[]`

#### `PUT /api/layout` — body `LayoutItem[]` (full replace)

#### `PATCH /api/layout/widget` — body `WidgetConfigPatch`

Update `config` for one `instance_id` without replacing the full layout.

#### `GET /api/events` — Server-Sent Events

Single SSE connection owned by the **shell** (not widget iframes). Each event is one JSON
object (`SSEMessage`) on the default `message` channel:

```json
{
  "channel": "system.stats",
  "data": { "cpu_percent": 12.5 },
  "ts": "2026-06-11T12:00:00+00:00"
}
```

**Frozen channel names** (`core/constants.py`):

| Channel | Purpose |
|---------|---------|
| `system.heartbeat` | Keep-alive (~30s) |
| `system.stats` | CPU / memory / uptime |
| `system.display` | Display geometry changes |
| `plugin.{id}.{event}` | Plugin-published events |

#### `GET /api/plugins` → `PluginSummary[]`

#### `GET /api/plugins/{id}/health` → `PluginHealth`

#### `POST /api/plugins/install` — body `PluginInstallRequest`

#### `POST /api/plugins/{id}/update`

#### `DELETE /api/plugins/{id}`

#### `/api/plugins/{id}/*`

Plugin-owned FastAPI routes mounted by the loader.

---

## Plugin manifest

Each plugin directory contains `manifest.json` validated against `PluginManifest`.

Example:

```json
{
  "id": "demo",
  "name": "Demo Plugin",
  "version": "1.0.0",
  "api_version": 1,
  "backend": "main.py",
  "components": [
    {
      "id": "demo_widget",
      "type": "widget",
      "name": "Demo Widget",
      "icon": "widgets",
      "entry": "src/widget.html",
      "size": { "w": 2, "h": 2 },
      "min_size": { "w": 2, "h": 2 }
    }
  ]
}
```

- `id`: lowercase slug (`^[a-z][a-z0-9-]*$`)
- `entry`: HTML path relative to plugin root
- `component_id` in layout matches `components[].id` (globally unique across all plugins)

---

## Layout grid

`LayoutItem` fields:

| Field | Description |
|-------|-------------|
| `instance_id` | Unique per widget instance on the dashboard |
| `component_id` | References a manifest `components[].id` |
| `x`, `y`, `w`, `h` | GridStack cell coordinates |
| `pane` | Workspace pane index (0-based) |
| `config` | Per-instance settings object |

---

## Shell ↔ widget iframe protocol

Widgets run in iframes. The shell holds the SSE connection and relays events via
`postMessage`. Message `type` values are frozen in `core/constants.py`:

| Type | Direction | Payload |
|------|-----------|---------|
| `PLUGIN_READY` | iframe → shell | `{ height: number }` |
| `OS_THEME_UPDATE` | shell → iframe | `{ theme, accent }` |
| `WIDGET_CONFIG` | shell → iframe | `{ instanceId, config }` |
| `WIDGET_CONFIG_UPDATE` | shell → iframe | `{ config }` |
| `SAVE_WIDGET_CONFIG` | iframe → shell | `{ instanceId, config }` |
| `SSE_RELAY` | shell → iframe | `{ channel, data, ts? }` |

---

## Plugin SDK (browser)

Built to `shell/dist/sdk/homelabos-sdk.js`, served at `/sdk/homelabos-sdk.js` as global `HomelabOS`.

### Frozen surface

```ts
HomelabOS.version          // "1.0.0"
HomelabOS.platform         // { kiosk, theme, accent }
HomelabOS.fetch(url, opts) // authenticated fetch to same origin
HomelabOS.subscribe(ch, fn) // SSE callback (relayed in iframes)
HomelabOS.getConfig()      // per-instance widget config
HomelabOS.saveConfig(obj)  // persist via shell postMessage
```

Implemented in `sdk/src/`, built to `shell/dist/sdk/homelabos-sdk.js`. Author guide: [PLUGIN_AUTHOR.md](PLUGIN_AUTHOR.md).

### iframe query params (shell → widget)

| Param | Example | Purpose |
|-------|---------|---------|
| `kiosk` | `true` | Kiosk styling |
| `theme` | `dark` | Initial theme |
| `accent` | `#89b4fa` | Accent color |

---

## Development mode

`HOMELABOS_DEV=1` enables laptop development without Pi hardware:

- Sets `mock_hal=True` automatically
- Uvicorn `--reload` when running `python -m core`
- Convenience wrapper: `python scripts/dev.py` (creates venv if needed)

This is **not** a separate product mode — the same contracts apply; HAL is mocked.

---

## Phase 0 checklist

- [x] Pydantic models (`core/models/`)
- [x] JSON Schema generated from models (`schemas/`)
- [x] Frozen HTTP API shapes documented
- [x] Frozen SSE envelope + channel names
- [x] Frozen postMessage protocol
- [x] Frozen SDK TypeScript surface

## Phase 1 checklist

- [x] JSON store + config/layout routes
- [x] System stats/display/power routes
- [x] SSE event bus + background publishers
- [x] Plugin loader + `apps/demo/`
- [x] HAL mock (`HOMELABOS_DEV=1`) + gpiozero on Pi
- [x] pytest (`tests/test_api.py`, `tests/test_hal.py`)

## Phase 2 checklist

- [x] Vite + TypeScript shell (taskbar, workspace)
- [x] SSE relay to widget iframes (single shell connection)
- [x] GridStack workspace (drag/resize, float, persist layout)
- [x] Display-aware grid geometry (physical capacity + viewport tile size)
- [x] Square tiles and inter-widget gaps
- [x] Settings, power, confirm, and app drawer modals
- [x] Widget chrome + config modal (`PATCH /api/layout/widget`)
- [ ] Multi-pane carousel (deferred)

## Phase 3 checklist

- [x] `homelabos-sdk` browser package
- [x] `docs/PLUGIN_AUTHOR.md`
- [x] `scripts/create-plugin.py`
- [x] `api_version` compatibility documented (above)
- [ ] Optional structured settings form / `REQUEST_SETTINGS` protocol (deferred)
