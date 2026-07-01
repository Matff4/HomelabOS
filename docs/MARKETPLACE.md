# HomelabOS Marketplace

The **HomelabOS-Plugins** repository hosts the public plugin catalog. HomelabOS fetches `index.json` from a configurable URL (default: GitHub raw on `main`).

## Catalog format (`index.json`)

```json
{
  "version": 1,
  "updated_at": "2026-06-30T12:00:00+00:00",
  "plugins": [
    {
      "id": "uptime",
      "name": "Uptime Widget",
      "version": "1.0.0",
      "description": "Shows system uptime on the dashboard.",
      "icon": "schedule",
      "tarball_url": "https://github.com/Matff4/HomelabOS-Plugins/releases/download/uptime-1.0.0/uptime-1.0.0.tar.gz",
      "api_version": 1,
      "homelabos_min": "1.0.0"
    }
  ]
}
```

| Field | Required | Notes |
|-------|----------|--------|
| `version` | yes | Catalog schema version (`1`) |
| `plugins[].id` | yes | Must match plugin `manifest.json` id |
| `plugins[].tarball_url` | yes | HTTPS URL to `.tar.gz` (root contains `manifest.json`) |
| `plugins[].version` | yes | Latest release semver |
| `plugins[].api_version` | yes | Must be `1` for HomelabOS 1.0.x |
| `plugins[].homelabos_min` | no | Minimum core version |

## HomelabOS API

```
GET /api/marketplace/catalog     → validated catalog (proxied from config marketplaceUrl)
GET /api/plugins                 → installed plugins (includes bundled flag)
POST /api/plugins/install        → { "url": "<tarball_url>" }
POST /api/plugins/{id}/update      → { "url": "<tarball_url>" }
DELETE /api/plugins/{id}         → remove user-installed plugin
```

Configure the catalog URL in **Settings → Plugin store URL**, or set `marketplaceUrl` in `data/config.json`.

## Plugin package layout

Tarballs must unpack to a directory containing `manifest.json` at the root (see [PLUGIN_AUTHOR.md](PLUGIN_AUTHOR.md)).

Example repo layout for **HomelabOS-Plugins**:

```
HomelabOS-Plugins/
├── index.json
├── plugins/
│   └── uptime/
│       ├── manifest.json
│       ├── main.py
│       └── src/widget.html
└── .github/workflows/
    └── release.yml          # build tarballs + update index.json
```

## Local development

Point `marketplaceUrl` at a local file URL in `data/config.json`:

```json
{
  "marketplaceUrl": "file:///opt/homelabos/tests/fixtures/marketplace-index.json"
}
```

Or override in tests via config PUT. Tarball URLs in the catalog may also use `file://` for offline installs.

## After install

The shell store calls the install API, then prompts to **restart homelabos** so backend routes and static mounts load. New widgets appear in **Edit → +** after restart (or full page reload).
