# HomelabOS — Plugin author guide

Build widgets and backend routes that run inside the HomelabOS kiosk. This guide covers bundled plugins in `apps/` (shipped with core) and the same layout used for user-installed plugins in Phase 4+.

**Contracts:** [CONTRACTS.md](CONTRACTS.md) · **Roadmap:** [../ROADMAP.md](../ROADMAP.md)

---

## Quick start

From the repo root:

```bash
python scripts/create-plugin.py my-sensor --name "My Sensor"
```

This creates `apps/my-sensor/` with `manifest.json`, `main.py`, and `src/widget.html`.

**Local dev:**

```bash
HOMELABOS_DEV=1 python -m core
# open http://localhost:8000 → Edit → + → add your widget
```

**On the Pi:** copy or merge into `/opt/homelabos/apps/`, then `homelabos-update`.

---

## Plugin layout

```
apps/my-sensor/
├── manifest.json       # Required — id, components, api_version
├── main.py             # Optional — FastAPI router mounted at /api/plugins/my-sensor/
└── src/
    └── widget.html     # Widget UI (iframe)
```

Rules:

- Folder name **must match** `manifest.id` (e.g. `apps/demo` ↔ `"id": "demo"`).
- Widget HTML is served at `/apps/{plugin_id}/{entry path}`.
- Backend routes mount at `/api/plugins/{plugin_id}/…` when `main.py` exports `router`.

---

## manifest.json

Validated against `PluginManifest` (`core/models/manifest.py`). Minimal example:

```json
{
  "id": "my-sensor",
  "name": "My Sensor",
  "version": "1.0.0",
  "api_version": 1,
  "backend": "main.py",
  "components": [
    {
      "id": "my_sensor_widget",
      "type": "widget",
      "name": "Sensor",
      "icon": "sensors",
      "entry": "src/widget.html",
      "size": { "w": 2, "h": 2 },
      "min_size": { "w": 2, "h": 2 }
    }
  ]
}
```

| Field | Notes |
|-------|--------|
| `id` | Lowercase slug: `^[a-z][a-z0-9-]*$` |
| `version` | Semver `x.y.z` |
| `api_version` | Must be `1` for HomelabOS 1.0.x (see [api_version](#api_version-compatibility)) |
| `backend` | Python module path relative to plugin root; omit if no API |
| `requires.core` | Optional minimum core semver (enforced on install in Phase 4) |
| `dependencies` | Other plugin ids (future) |
| `components[].id` | Globally unique across all plugins |
| `components[].type` | `widget`, `app`, or `action` (shell drawer lists `widget` and `app`) |
| `components[].entry` | HTML path relative to plugin root |
| `components[].icon` | Material Symbols name (see shell taskbar) |
| `components[].size` | Default grid footprint when added from drawer |
| `components[].min_size` | Minimum w×h in edit mode |
| `components[].settings` | Declarative fields (future form UI; use JSON config modal today) |

Reference plugin: [`apps/demo/`](../apps/demo/).

---

## Backend (Python)

`main.py` must expose a FastAPI `APIRouter` named `router`:

```python
from fastapi import APIRouter

router = APIRouter()


@router.get("/status")
async def status() -> dict[str, str]:
    return {"ok": "true"}
```

Call from a widget:

```javascript
HomelabOS.fetch('/api/plugins/my-sensor/status')
  .then((r) => r.json())
  .then(console.log);
```

Use same-origin relative URLs. The kiosk serves shell + API on one origin.

Publish SSE events from backend (optional):

```python
from core.events.bus import get_event_bus
from core.constants import SSEChannel

await get_event_bus().publish(
    SSEChannel.plugin("my-sensor", "reading"),
    {"temp_c": 42.0},
)
```

Widgets subscribe via `HomelabOS.subscribe('plugin.my-sensor.reading', fn)`.

---

## Widget UI (browser)

Widgets run in **sandboxed iframes**. Include the SDK:

```html
<script src="/sdk/homelabos-sdk.js"></script>
```

### SDK surface

```javascript
HomelabOS.version          // "1.0.0"
HomelabOS.platform         // { kiosk, theme, accent }
HomelabOS.fetch(url, opts) // same-origin fetch
HomelabOS.subscribe(ch, fn) // SSE relay from shell
HomelabOS.getConfig()      // per-instance config object
HomelabOS.saveConfig(obj)  // persist → layout.json via shell
```

### iframe query params (set by shell)

| Param | Purpose |
|-------|---------|
| `kiosk=true` | Hide chrome meant for dev preview |
| `theme` | `dark` or `light` |
| `accent` | Accent color name or `#hex` |
| `instance` | Widget instance id |

### Live stats example

```javascript
HomelabOS.subscribe('system.stats', (data) => {
  cpuEl.textContent = data.cpu_percent.toFixed(1) + '%';
});
```

### Per-instance config

Shell sends initial config on load (`WIDGET_CONFIG`). Users edit via **Edit → gear icon → JSON editor**, or your widget can call `saveConfig`:

```javascript
const cfg = HomelabOS.getConfig();
if (cfg.title) titleEl.textContent = cfg.title;

await HomelabOS.saveConfig({ ...cfg, title: 'Custom title' });
```

Common keys: `title` (shown in widget header when set).

### Styling

- Use `background: transparent` on `body` — the shell draws the card chrome (border, radius, header).
- Set `color-scheme` or listen for `OS_THEME_UPDATE` via CSS variables (`--accent` is updated by the SDK).

---

## Layout grid

When a user adds your widget, the shell stores a `LayoutItem`:

| Field | Meaning |
|-------|---------|
| `instance_id` | Unique on dashboard |
| `component_id` | Your `components[].id` |
| `x`, `y`, `w`, `h` | GridStack cells |
| `pane` | Workspace pane (0 today) |
| `config` | Your per-instance JSON |

Grid capacity comes from the **physical display**; tile pixel size from the **browser viewport**. Design widgets to reflow inside the iframe — avoid fixed pixel layouts.

---

## Testing

### Laptop (no Pi)

```bash
python scripts/dev.py
pytest
curl -s http://localhost:8000/api/plugins
curl -s http://localhost:8000/api/components
curl -s http://localhost:8000/api/plugins/demo/ping
```

Shell dev server (hot reload UI):

```bash
cd shell && npm run dev
```

### Raspberry Pi

1. Deploy plugin under `/opt/homelabos/apps/<id>/`.
2. `homelabos-update` (rebuilds shell, restarts services).
3. Optional: `homelabos-update --dev-vnc` and connect VNC to verify layout.

Check plugin health: `GET /api/plugins/{id}/health`.

---

## api_version compatibility

| HomelabOS core | Supported `manifest.api_version` | SDK |
|----------------|--------------------------------|-----|
| 1.0.x | `1` only | `1.0.0` at `/sdk/homelabos-sdk.js` |

- **`api_version`** describes the manifest + loader contract, not your plugin’s own `version`.
- Core rejects manifests that fail Pydantic validation (wrong `api_version` literal, bad shapes).
- **Phase 4 install** will reject plugins whose `api_version` exceeds what core supports.
- A future **`api_version: 2`** would ship with HomelabOS 2.x and may change manifest fields or SDK messages — bump together and document in CONTRACTS.

Optional `requires.core` (semver) will gate install when the marketplace API lands.

---

## Checklist before shipping

- [ ] `manifest.id` matches folder name
- [ ] `components[].id` is unique across all installed plugins
- [ ] `api_version: 1`
- [ ] Widget works at minimum `min_size`
- [ ] Widget handles missing/empty `config`
- [ ] Backend errors return sensible HTTP status codes
- [ ] No hard-coded `localhost` URLs — use relative paths
- [ ] Tested in kiosk mode (`?kiosk=true`) and edit mode

---

## What’s next (platform)

- **Phase 4** — install/update/delete API (`data/plugins/`, `registry.json`) ✅
- **Phase 5** — in-shell store + [HomelabOS-Plugins](https://github.com/Matff4/HomelabOS-Plugins) catalog
- **Future** — manifest `settings` → structured config form; `REQUEST_SETTINGS` iframe protocol (v1 parity)

### Service restart after install

User-installed plugins are extracted to `data/plugins/`. New components appear after install, but **backend routes mount at startup**. Restart after install or update:

```bash
sudo systemctl restart homelabos
```

For ecosystem plugins, target the separate **HomelabOS-Plugins** repo once Phase 5 lands; until then, bundle under `apps/` for development.
