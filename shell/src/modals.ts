import type { ComponentInfo, SystemConfig } from './types';
import { applyTheme, saveConfig } from './api';
import { selectOptions } from './format';
import { icon, icons } from './icons';

type ConfirmHandler = () => void | Promise<void>;

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
        .then(() => this.close())
        .catch((err) => {
          alert(err instanceof Error ? err.message : 'Action failed');
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
      const next: SystemConfig = {
        ...config,
        theme: data.get('theme') as SystemConfig['theme'],
        accentColor: data.get('accentColor') as SystemConfig['accentColor'],
        timeFormat: data.get('timeFormat') as SystemConfig['timeFormat'],
        ramFormat: data.get('ramFormat') as SystemConfig['ramFormat'],
        barHeight: data.get('barHeight') as SystemConfig['barHeight'],
        widgetBarHeight: data.get('widgetBarHeight') as SystemConfig['widgetBarHeight'],
      };
      void saveConfig(next).then(() => {
        applyTheme(next);
        onSaved(next);
        this.close();
      });
    });
  }

  openPower(): void {
    this.open(`
      <div class="modal-backdrop">
        <div class="modal-card modal-compact">
          <div class="modal-header"><h2>Core Management</h2></div>
          <div class="modal-body modal-actions vertical">
            <button type="button" class="modal-btn sys-btn" data-power="restart-kiosk">Restart Kiosk</button>
            <button type="button" class="modal-btn sys-btn danger" data-power="reboot">Reboot</button>
            <button type="button" class="modal-btn sys-btn danger" data-power="shutdown">Shutdown</button>
          </div>
          <div class="modal-footer">
            <button type="button" class="modal-btn" data-modal-close>Cancel</button>
          </div>
        </div>
      </div>
    `);

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

  openDrawer(components: ComponentInfo[], onPick: (component: ComponentInfo) => void): void {
    const widgets = components.filter((c) => c.type === 'widget');
    this.open(`
      <div class="modal-backdrop">
        <div class="modal-card modal-wide">
          <div class="modal-header"><h2>Add widget</h2></div>
          <div class="modal-body">
            <ul class="drawer-list">
              ${widgets
                .map(
                  (c) =>
                    `<li><button type="button" class="drawer-item" data-id="${c.id}">${c.name}</button></li>`,
                )
                .join('') || '<li class="muted">No widgets available</li>'}
            </ul>
          </div>
          <div class="modal-footer">
            <button type="button" class="modal-btn" data-modal-close>Close</button>
          </div>
        </div>
      </div>
    `);

    this.root.querySelectorAll('.drawer-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id!;
        const component = widgets.find((c) => c.id === id);
        if (component) {
          onPick(component);
          this.close();
        }
      });
    });
  }

  openWidgetConfig(
    instanceId: string,
    widgetName: string,
    config: Record<string, unknown>,
    onSave: (next: Record<string, unknown>) => Promise<void>,
  ): void {
    const json = JSON.stringify(config, null, 2);
    this.open(`
      <div class="modal-backdrop">
        <div class="modal-card modal-wide">
          <div class="modal-header">
            <h2>${widgetName}</h2>
            <button type="button" class="taskbar-btn modal-close-btn" data-modal-close title="Close">
              ${icon(icons.close)}
            </button>
          </div>
          <form id="widget-config-form" class="modal-body">
            <p class="muted">Instance <code>${instanceId}</code></p>
            <label class="setting-row">Configuration (JSON)
              <textarea id="widget-config-json" class="config-json" rows="6" spellcheck="false">${json}</textarea>
            </label>
          </form>
          <div class="modal-footer">
            <button type="button" class="modal-btn" data-modal-close>Cancel</button>
            <button type="submit" form="widget-config-form" class="modal-btn primary">Save</button>
          </div>
        </div>
      </div>
    `);

    const form = this.root.querySelector('#widget-config-form') as HTMLFormElement | null;
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      const raw = (this.root.querySelector('#widget-config-json') as HTMLTextAreaElement).value;
      try {
        const next = JSON.parse(raw) as Record<string, unknown>;
        void onSave(next).then(() => this.close());
      } catch {
        alert('Invalid JSON — check syntax and try again.');
      }
    });
  }
}
