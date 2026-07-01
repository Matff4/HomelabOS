import {
  deletePlugin,
  fetchMarketplaceCatalog,
  fetchPlugins,
  installPlugin,
  updatePlugin,
} from './api';
import { icon, icons } from './icons';
import type { Modals } from './modals';
import type { MarketplaceCatalog, MarketplaceEntry, PluginSummary } from './store-types';

function semverLt(current: string, latest: string): boolean {
  const parse = (value: string) => value.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const a = parse(current);
  const b = parse(latest);
  for (let i = 0; i < 3; i += 1) {
    if (a[i]! < b[i]!) return true;
    if (a[i]! > b[i]!) return false;
  }
  return false;
}

function catalogEntry(
  entry: MarketplaceEntry,
  installed: PluginSummary | undefined,
): { status: string; action: 'install' | 'update' | 'installed' | 'bundled' } {
  if (installed?.bundled) return { status: 'Bundled with core', action: 'bundled' };
  if (!installed) return { status: 'Not installed', action: 'install' };
  if (semverLt(installed.version, entry.version)) {
    return { status: `Update available (${installed.version} → ${entry.version})`, action: 'update' };
  }
  return { status: `Installed (${installed.version})`, action: 'installed' };
}

function showRestartNotice(modals: Modals, message: string): void {
  modals.alert('Plugin store', message);
}

export function openPluginStore(modals: Modals, onChanged: () => void): void {
  void renderStore(modals, onChanged, 'store');
}

async function renderStore(
  modals: Modals,
  onChanged: () => void,
  tab: 'store' | 'installed',
): Promise<void> {
  modals.openShell(`
    <div class="modal-backdrop">
      <div class="modal-card modal-wide store-modal">
        <div class="modal-header">
          <h2>Plugin store</h2>
          <button type="button" class="taskbar-btn modal-close-btn" data-modal-close title="Close">
            ${icon(icons.close)}
          </button>
        </div>
        <div class="store-tabs">
          <button type="button" class="store-tab ${tab === 'store' ? 'active' : ''}" data-tab="store">Browse</button>
          <button type="button" class="store-tab ${tab === 'installed' ? 'active' : ''}" data-tab="installed">Installed</button>
        </div>
        <div class="modal-body store-body">
          <p class="muted store-loading">Loading…</p>
        </div>
        <div class="modal-footer">
          <button type="button" class="modal-btn" data-modal-close>Close</button>
        </div>
      </div>
    </div>
  `);

  const body = modals.querySelector('.store-body');
  if (!body) return;

  modals.querySelectorAll('.store-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = (btn as HTMLElement).dataset.tab as 'store' | 'installed';
      void renderStore(modals, onChanged, next);
    });
  });

  try {
    const [catalog, installed] = await Promise.all([fetchMarketplaceCatalog(), fetchPlugins()]);
    const byId = new Map(installed.map((row) => [row.id, row]));

    if (tab === 'store') {
      body.innerHTML = renderCatalog(catalog, byId);
      bindCatalogActions(modals, body, catalog, onChanged);
    } else {
      body.innerHTML = renderInstalled(installed, catalog);
      bindInstalledActions(modals, body, catalog, onChanged);
    }
  } catch (err) {
    body.innerHTML = `<p class="store-error">${err instanceof Error ? err.message : 'Failed to load store'}</p>`;
  }
}

function renderCatalog(catalog: MarketplaceCatalog, installed: Map<string, PluginSummary>): string {
  if (catalog.plugins.length === 0) {
    return '<p class="muted">No plugins in the catalog.</p>';
  }
  return `<ul class="store-list">${catalog.plugins
    .map((entry) => {
      const meta = catalogEntry(entry, installed.get(entry.id));
      const glyph = entry.icon ? icon(entry.icon) : icon(icons.widget);
      const disabled = meta.action === 'installed' || meta.action === 'bundled';
      const label =
        meta.action === 'install'
          ? 'Install'
          : meta.action === 'update'
            ? 'Update'
            : meta.action === 'bundled'
              ? 'Core'
              : 'Installed';
      return `<li class="store-row">
        <div class="store-row-main">
          <span class="store-icon">${glyph}</span>
          <div class="store-copy">
            <strong>${entry.name}</strong>
            <span class="muted store-meta">v${entry.version} · ${meta.status}</span>
            ${entry.description ? `<p class="store-desc">${entry.description}</p>` : ''}
          </div>
        </div>
        <button type="button" class="modal-btn ${meta.action === 'update' ? 'primary' : ''} store-action"
          data-action="${meta.action}" data-id="${entry.id}" ${disabled ? 'disabled' : ''}>${label}</button>
      </li>`;
    })
    .join('')}</ul>`;
}

function renderInstalled(installed: PluginSummary[], catalog: MarketplaceCatalog): string {
  if (installed.length === 0) {
    return '<p class="muted">No plugins installed.</p>';
  }
  const catalogById = new Map(catalog.plugins.map((row) => [row.id, row]));
  return `<ul class="store-list">${installed
    .map((plugin) => {
      const entry = catalogById.get(plugin.id);
      const update =
        entry && !plugin.bundled && semverLt(plugin.version, entry.version)
          ? `<button type="button" class="modal-btn primary store-installed-update" data-id="${plugin.id}">Update to v${entry.version}</button>`
          : '';
      const remove = plugin.bundled
        ? '<span class="muted store-tag">Bundled</span>'
        : `<button type="button" class="modal-btn danger store-installed-remove" data-id="${plugin.id}">Remove</button>`;
      return `<li class="store-row">
        <div class="store-row-main">
          <span class="store-icon">${icon(icons.widget)}</span>
          <div class="store-copy">
            <strong>${plugin.name}</strong>
            <span class="muted store-meta">${plugin.id} · v${plugin.version}</span>
          </div>
        </div>
        <div class="store-row-actions">${update}${remove}</div>
      </li>`;
    })
    .join('')}</ul>`;
}

function bindCatalogActions(
  modals: Modals,
  body: Element,
  catalog: MarketplaceCatalog,
  onChanged: () => void,
): void {
  body.querySelectorAll('.store-action').forEach((btn) => {
    btn.addEventListener('click', () => {
      const el = btn as HTMLElement;
      const action = el.dataset.action;
      const id = el.dataset.id;
      if (!id || action === 'installed' || action === 'bundled') return;
      const entry = catalog.plugins.find((row) => row.id === id);
      if (!entry) return;

      const verb = action === 'update' ? 'Update' : 'Install';
      modals.confirm(`${verb} ${entry.name}?`, `Version ${entry.version}`, async () => {
        const result =
          action === 'update'
            ? await updatePlugin(entry.id, entry.tarball_url)
            : await installPlugin(entry.tarball_url);
        onChanged();
        showRestartNotice(modals, result.message);
        void renderStore(modals, onChanged, 'store');
      }, false);
    });
  });
}

function bindInstalledActions(
  modals: Modals,
  body: Element,
  catalog: MarketplaceCatalog,
  onChanged: () => void,
): void {
  body.querySelectorAll('.store-installed-update').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = (btn as HTMLElement).dataset.id!;
      const entry = catalog.plugins.find((row) => row.id === id);
      if (!entry) return;
      modals.confirm(`Update ${entry.name}?`, `Install version ${entry.version}`, async () => {
        const result = await updatePlugin(id, entry.tarball_url);
        onChanged();
        showRestartNotice(modals, result.message);
        void renderStore(modals, onChanged, 'installed');
      }, false);
    });
  });

  body.querySelectorAll('.store-installed-remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = (btn as HTMLElement).dataset.id!;
      modals.confirm('Remove plugin?', `Remove ${id} from this device`, async () => {
        const result = await deletePlugin(id);
        onChanged();
        showRestartNotice(modals, result.message);
        void renderStore(modals, onChanged, 'installed');
      });
    });
  });
}
