import type { ComponentInfo, SystemConfig } from './types';
import { applyTheme, saveConfig } from './api';
import { bindAddDrawer, renderAddDrawer, type AddDrawerHandlers } from './add-drawer';
import { selectOptions } from './format';
import { icon, icons } from './icons';
import { openPluginStore } from './store-modal';
import { showToast } from './toast';
import { readWidgetSettingsForm, renderWidgetSettingsForm } from './widget-settings';
import type { WidgetSetting } from './types';

type ConfirmHandler = () => void | Promise<void | boolean>;

export class Modals {
  private readonly root: HTMLElement;

  constructor(rootId = 'modal-root') {
    const el = document.getElementById(rootId);
    if (!el) throw new Error('modal-root missing');
    this.root = el;
  }

  private open(content: string): void {
    this.root.innerHTML = content;
    this.root.hidden = false;
    this.root.querySelectorAll('[data-modal-close]').forEach((btn) => {
      btn.addEventListener('click', () => this.close());
    });
  }

  close(): void {
    this.root.hidden = true;
    this.root.innerHTML = '';
  }

  /** Render modal HTML and wire close buttons (used by store UI). */
  openShell(content: string): void {
    this.open(content);
  }

  querySelector<T extends Element = Element>(selector: string): T | null {
    return this.root.querySelector(selector);
  }

  querySelectorAll<T extends Element = Element>(selector: string): NodeListOf<T> {
    return this.root.querySelectorAll(selector);
  }

  alert(title: string, message: string): void {
    this.open(`
      <div class="modal-backdrop">
        <div class="modal-card modal-compact">
          <div class="modal-header"><h2>${title}</h2></div>
          <div class="modal-body"><p class="store-alert">${message.replace(/\n/g, '<br>')}</p></div>
          <div class="modal-footer">
            <button type="button" class="modal-btn primary" data-modal-close>OK</button>
          </div>
        </div>
      </div>
    `);
  }

  openStore(onChanged: () => void): void {
    openPluginStore(this, onChanged);
  }

  confirm(title: string, message: string, onConfirm: ConfirmHandler, danger = true): void {
    this.open(`
      <div class="modal-backdrop">
        <div class="modal-card modal-compact">
          <div class="modal-header"><h2>${title}</h2></div>
          <div class="modal-body"><p>${message}</p></div>
          <div class="modal-footer">
            <button type="button" class="modal-btn" data-modal-close>Cancel</button>
            <button type="button" class="modal-btn ${danger ? 'danger' : 'primary'}" id="modal-confirm">Confirm</button>
          </div>
        </div>
      </div>
    `);
    this.root.querySelector('#modal-confirm')?.addEventListener('click', () => {
      void Promise.resolve(onConfirm())
        .then((keepOpen) => {
          if (keepOpen !== false) this.close();
        })
        .catch((err) => {
          showToast(err instanceof Error ? err.message : 'Action failed', 'error');
        });
    });
  }

  openSettings(config: SystemConfig, onSaved: (cfg: SystemConfig) => void): void {
    this.open(`
      <div class="modal-backdrop">
        <div class="modal-card modal-wide">
          <div class="modal-header">
            <h2>Dashboard Settings</h2>
            <button type="button" class="taskbar-btn modal-close-btn" data-modal-close title="Close">
              ${icon(icons.close)}
            </button>
          </div>
          <form id="settings-form" class="modal-body">
            <div class="settings-form">
              <label class="setting-row">Theme
                <select name="theme">${selectOptions(['dark', 'light'], config.theme)}</select>
              </label>
              <label class="setting-row">Accent
                <select name="accentColor">${selectOptions(['blue', 'green', 'purple', 'red', 'orange', 'yellow'], config.accentColor)}</select>
              </label>
              <label class="setting-row">Time format
                <select name="timeFormat">${selectOptions(['24', '12'], config.timeFormat)}</select>
              </label>
              <label class="setting-row">RAM display
                <select name="ramFormat">${selectOptions(['percent', 'absolute'], config.ramFormat)}</select>
              </label>
              <label class="setting-row">Taskbar size
                <select name="barHeight">${selectOptions(['small', 'medium', 'big'], config.barHeight)}</select>
              </label>
              <label class="setting-row">Widget title bar
                <select name="widgetBarHeight">${selectOptions(['small', 'medium', 'big'], config.widgetBarHeight)}</select>
              </label>
              <label class="setting-row">Plugin store URL
                <input type="url" name="marketplaceUrl" class="setting-input"
                  value="${config.marketplaceUrl ?? ''}"
                  placeholder="https://raw.githubusercontent.com/…/index.json" />
              </label>
            </div>
          </form>
          <div class="modal-footer">
            <button type="button" class="modal-btn" data-modal-close>Cancel</button>
            <button type="submit" form="settings-form" class="modal-btn primary">Save</button>
          </div>
        </div>
      </div>
    `);

    const form = this.root.querySelector('#settings-form') as HTMLFormElement | null;
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const rawMarketplace = String(data.get('marketplaceUrl') ?? '').trim();
      const next: SystemConfig = {
        ...config,
        theme: data.get('theme') as SystemConfig['theme'],
        accentColor: data.get('accentColor') as SystemConfig['accentColor'],
        timeFormat: data.get('timeFormat') as SystemConfig['timeFormat'],
        ramFormat: data.get('ramFormat') as SystemConfig['ramFormat'],
        barHeight: data.get('barHeight') as SystemConfig['barHeight'],
        widgetBarHeight: data.get('widgetBarHeight') as SystemConfig['widgetBarHeight'],
        marketplaceUrl: rawMarketplace || null,
      };
      void saveConfig(next).then(() => {
        applyTheme(next);
        onSaved(next);
        this.close();
      });
    });
  }

  openPower(kiosk: boolean): void {
    const devBackup = kiosk
      ? ''
      : `<a class="modal-btn sys-btn" href="/api/system/backup" download>Download data backup</a>`;
    this.open(`
      <div class="modal-backdrop">
        <div class="modal-card modal-compact">
          <div class="modal-header"><h2>Core Management</h2></div>
          <div class="modal-body modal-actions vertical">
            <button type="button" class="modal-btn sys-btn danger" id="soft-reset-btn">Clear panes &amp; cache</button>
            <button type="button" class="modal-btn sys-btn" data-power="restart-kiosk">Restart Kiosk</button>
            ${devBackup}
            <button type="button" class="modal-btn sys-btn danger" data-power="reboot">Reboot</button>
            <button type="button" class="modal-btn sys-btn danger" data-power="shutdown">Shutdown</button>
          </div>
          <div class="modal-footer">
            <button type="button" class="modal-btn" data-modal-close>Cancel</button>
          </div>
        </div>
      </div>
    `);

    this.root.querySelector('#soft-reset-btn')?.addEventListener('click', () => {
      this.confirm(
        'Clear dashboard?',
        'Removes all widgets from every pane and taskbar buttons, then restarts the kiosk to clear browser cache. Installed plugins and settings are kept.',
        async () => {
          const res = await fetch('/api/system/soft-reset', { method: 'POST' });
          if (!res.ok) {
            throw new Error('Reset failed');
          }
          if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map((key) => caches.delete(key)));
          }
          try {
            localStorage.clear();
            sessionStorage.clear();
          } catch {
            /* ignore */
          }
          const restart = await fetch('/api/system/power', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'restart-kiosk' }),
          });
          if (!restart.ok) {
            window.location.reload();
            return;
          }
          window.setTimeout(() => window.location.reload(), 2500);
        },
        true,
      );
    });

    this.root.querySelectorAll('[data-power]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = (btn as HTMLElement).dataset.power!;
        const labels: Record<string, string> = {
          reboot: 'Reboot the host?',
          shutdown: 'Shut down the host?',
          'restart-kiosk': 'Restart the kiosk service?',
        };
        this.confirm('Confirm', labels[action] ?? 'Proceed?', async () => {
          const res = await fetch('/api/system/power', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action }),
          });
          if (!res.ok) {
            throw new Error(
              'Power action was rejected. Run homelabos-update on the Pi to install sudo permissions.',
            );
          }
        });
      });
    });
  }

  openAddDrawer(components: ComponentInfo[], handlers: AddDrawerHandlers): void {
    this.open(renderAddDrawer(components));
    bindAddDrawer(this.root, components, {
      onWidget: (component) => {
        handlers.onWidget(component);
        this.close();
      },
      onApp: (component) => {
        handlers.onApp(component);
        this.close();
      },
      onAction: (component) => {
        handlers.onAction(component);
        this.close();
      },
    });
  }

  openWidgetSettings(
    widgetName: string,
    settings: WidgetSetting[],
    config: Record<string, unknown>,
    onSave: (next: Record<string, unknown>) => Promise<void>,
  ): void {
    this.open(`
      <div class="modal-backdrop">
        <div class="modal-card modal-widget-settings">
          <div class="modal-header">
            <h2>${widgetName}</h2>
            <button type="button" class="taskbar-btn modal-close-btn" data-modal-close title="Close">
              ${icon(icons.close)}
            </button>
          </div>
          <form id="widget-settings-form" class="modal-body">
            <div class="widget-settings-form">
              ${renderWidgetSettingsForm(settings, config)}
            </div>
          </form>
          <div class="modal-footer">
            <button type="button" class="modal-btn" data-modal-close>Cancel</button>
            <button type="submit" form="widget-settings-form" class="modal-btn primary">Save</button>
          </div>
        </div>
      </div>
    `);

    const form = this.root.querySelector('#widget-settings-form') as HTMLFormElement | null;
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      const next = readWidgetSettingsForm(form, settings, config);
      void onSave(next).then(() => this.close());
    });
  }
}
