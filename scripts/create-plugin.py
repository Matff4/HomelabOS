#!/usr/bin/env python3
"""Scaffold a new bundled plugin under apps/."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from textwrap import dedent

ROOT = Path(__file__).resolve().parent.parent
APPS_DIR = ROOT / "apps"
SLUG_RE = re.compile(r"^[a-z][a-z0-9-]*$")


def _widget_id(plugin_id: str) -> str:
    return plugin_id.replace("-", "_") + "_widget"


def _main_py(plugin_id: str) -> str:
    return dedent(
        f'''\
        from fastapi import APIRouter

        router = APIRouter()


        @router.get("/ping")
        async def ping() -> dict[str, bool]:
            return {{"pong": True, "plugin": "{plugin_id}"}}
        '''
    )


def _widget_html(display_name: str) -> str:
    return dedent(
        f'''\
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>{display_name}</title>
          <style>
            :root {{ color-scheme: dark; --accent: #89b4fa; --text: #cdd6f4; --muted: #a6adc8; }}
            html, body {{
              margin: 0;
              min-height: 100%;
              font-family: system-ui, sans-serif;
              background: transparent;
              color: var(--text);
            }}
            body {{ padding: 8px 10px; }}
            body[data-kiosk="true"] h2 {{ display: none; }}
            h2 {{ margin: 0 0 6px; font-size: 0.95rem; color: var(--accent); }}
            .stat {{ font-variant-numeric: tabular-nums; color: var(--muted); font-size: 0.8rem; line-height: 1.4; }}
          </style>
        </head>
        <body>
          <h2 id="title">{display_name}</h2>
          <div class="stat" id="status">Loading…</div>
          <script src="/sdk/homelabos-sdk.js"></script>
          <script>
            (function () {{
              function sdk() {{
                if (!window.HomelabOS) return null;
                return typeof window.HomelabOS.getConfig === 'function'
                  ? window.HomelabOS
                  : window.HomelabOS.HomelabOS || null;
              }}

              function boot() {{
                var titleEl = document.getElementById('title');
                var statusEl = document.getElementById('status');
                if (new URLSearchParams(location.search).get('kiosk') === 'true') {{
                  document.body.dataset.kiosk = 'true';
                }}
                var api = sdk();
                if (!api) {{
                  statusEl.textContent = 'SDK failed to load';
                  return;
                }}
                var cfg = api.getConfig();
                if (cfg.title) titleEl.textContent = cfg.title;

                api.subscribe('system.stats', function (data) {{
                  statusEl.textContent =
                    'CPU: ' + Number(data.cpu_percent).toFixed(1) + '% · RAM: ' +
                    Number(data.mem_percent).toFixed(1) + '%';
                }});
              }}
              if (document.readyState === 'loading') {{
                document.addEventListener('DOMContentLoaded', boot);
              }} else {{
                boot();
              }}
            }})();
          </script>
        </body>
        </html>
        '''
    )


def _manifest(plugin_id: str, display_name: str, *, with_backend: bool) -> dict:
    manifest: dict = {
        "id": plugin_id,
        "name": display_name,
        "version": "1.0.0",
        "api_version": 1,
        "components": [
            {
                "id": _widget_id(plugin_id),
                "type": "widget",
                "name": display_name,
                "icon": "widgets",
                "entry": "src/widget.html",
                "size": {"w": 2, "h": 2},
                "min_size": {"w": 2, "h": 2},
            }
        ],
    }
    if with_backend:
        manifest["backend"] = "main.py"
    return manifest


def create_plugin(
    plugin_id: str,
    display_name: str,
    *,
    with_backend: bool = True,
    force: bool = False,
) -> Path:
    if not SLUG_RE.match(plugin_id):
        raise SystemExit(f"Invalid plugin id {plugin_id!r} — use lowercase slug (e.g. my-sensor)")

    dest = APPS_DIR / plugin_id
    if dest.exists() and not force:
        raise SystemExit(f"Already exists: {dest}\nUse --force to overwrite scaffold files.")

    dest.mkdir(parents=True, exist_ok=True)
    (dest / "src").mkdir(exist_ok=True)

    manifest_path = dest / "manifest.json"
    manifest_path.write_text(
        json.dumps(_manifest(plugin_id, display_name, with_backend=with_backend), indent=2) + "\n",
        encoding="utf-8",
    )
    (dest / "src" / "widget.html").write_text(_widget_html(display_name), encoding="utf-8")
    if with_backend:
        (dest / "main.py").write_text(_main_py(plugin_id), encoding="utf-8")

    return dest


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Create a new HomelabOS plugin scaffold under apps/",
        epilog="See docs/PLUGIN_AUTHOR.md for the full authoring guide.",
    )
    parser.add_argument("id", help="Plugin id (lowercase slug, e.g. my-sensor)")
    parser.add_argument("--name", help="Display name (default: title-cased id)")
    parser.add_argument(
        "--no-backend",
        action="store_true",
        help="Static widget only — omit main.py and backend field",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite manifest.json, main.py, and src/widget.html if present",
    )
    args = parser.parse_args()

    display_name = args.name or args.id.replace("-", " ").title()
    dest = create_plugin(
        args.id,
        display_name,
        with_backend=not args.no_backend,
        force=args.force,
    )

    print(f"Created plugin at {dest.relative_to(ROOT)}/")
    print()
    print("Next steps:")
    print("  1. Edit manifest.json and src/widget.html")
    if not args.no_backend:
        print("  2. Add routes in main.py")
    print("  3. HOMELABOS_DEV=1 python -m core")
    print("  4. Open http://localhost:8000 → Edit → + → add your widget")
    print()
    print("Docs: docs/PLUGIN_AUTHOR.md")


if __name__ == "__main__":
    main()
