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
| Plugin SDK (browser) | `1.0.0` | `sdk/` → `shell/dist/sdk/homelabos-sdk.js` |

Breaking changes require bumping the relevant version and updating this document.

---

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

### Implemented (Phase 0)

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

### Planned (Phase 1+) — shapes frozen here

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

Built to `shell/dist/sdk/homelabos-sdk.js` as global `HomelabOS`.

### Frozen surface

```ts
HomelabOS.version          // "1.0.0"
HomelabOS.platform         // { kiosk, theme, accent }
HomelabOS.fetch(url, opts) // authenticated fetch to same origin
HomelabOS.subscribe(ch, fn) // SSE callback (relayed in iframes)
HomelabOS.getConfig()      // per-instance widget config
HomelabOS.saveConfig(obj)  // persist via shell postMessage
```

Implementation ships in Phase 3; TypeScript types and stub exist in `sdk/src/` from Phase 0.

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
