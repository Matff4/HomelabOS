import type { ComponentInfo, SystemConfig } from './types';
import { applyTheme, saveConfig } from './api';

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
        <div class="modal-card">
          <h2>${title}</h2>
          <p>${message}</p>
          <div class="modal-actions">
            <button type="button" class="taskbar-btn" data-modal-close>Cancel</button>
            <button type="button" class="taskbar-btn ${danger ? 'danger' : 'primary'}" id="modal-confirm">Confirm</button>
          </div>
        </div>
      </div>
    `);
    this.root.querySelector('#modal-confirm')?.addEventListener('click', () => {
      void Promise.resolve(onConfirm()).finally(() => this.close());
    });
  }

  openSettings(config: SystemConfig, onSaved: (cfg: SystemConfig) => void): void {
    this.open(`
      <div class="modal-backdrop">
        <div class="modal-card modal-wide">
          <h2>Settings</h2>
          <form id="settings-form" class="modal-form">
            <label>Theme
              <select name="theme">
                <option value="dark" ${config.theme === 'dark' ? 'selected' : ''}>Dark</option>
                <option value="light" ${config.theme === 'light' ? 'selected' : ''}>Light</option>
              </select>
            </label>
            <label>Accent
              <select name="accentColor">
                ${['blue', 'green', 'purple', 'red', 'orange', 'yellow']
                  .map(
                    (c) =>
                      `<option value="${c}" ${config.accentColor === c ? 'selected' : ''}>${c}</option>`,
                  )
                  .join('')}
              </select>
            </label>
            <label>Time format
              <select name="timeFormat">
                <option value="24" ${config.timeFormat === '24' ? 'selected' : ''}>24h</option>
                <option value="12" ${config.timeFormat === '12' ? 'selected' : ''}>12h</option>
              </select>
            </label>
            <label>RAM display
              <select name="ramFormat">
                <option value="percent" ${config.ramFormat === 'percent' ? 'selected' : ''}>Percent</option>
                <option value="absolute" ${config.ramFormat === 'absolute' ? 'selected' : ''}>Absolute</option>
              </select>
            </label>
            <label>Taskbar size
              <select name="barHeight">
                ${['small', 'medium', 'big']
                  .map(
                    (s) =>
                      `<option value="${s}" ${config.barHeight === s ? 'selected' : ''}>${s}</option>`,
                  )
                  .join('')}
              </select>
            </label>
            <div class="modal-actions">
              <button type="button" class="taskbar-btn" data-modal-close>Cancel</button>
              <button type="submit" class="taskbar-btn primary">Save</button>
            </div>
          </form>
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
        widgetBarHeight: config.widgetBarHeight,
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
        <div class="modal-card">
          <h2>System</h2>
          <div class="modal-actions vertical">
            <button type="button" class="taskbar-btn" data-power="restart-kiosk">Restart kiosk</button>
            <button type="button" class="taskbar-btn danger" data-power="reboot">Reboot</button>
            <button type="button" class="taskbar-btn danger" data-power="shutdown">Shutdown</button>
            <button type="button" class="taskbar-btn" data-modal-close>Cancel</button>
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
          await fetch('/api/system/power', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action }),
          });
        });
      });
    });
  }

  openDrawer(components: ComponentInfo[], onPick: (component: ComponentInfo) => void): void {
    const widgets = components.filter((c) => c.type === 'widget');
    this.open(`
      <div class="modal-backdrop">
        <div class="modal-card modal-wide">
          <h2>Add widget</h2>
          <ul class="drawer-list">
            ${widgets
              .map(
                (c) =>
                  `<li><button type="button" class="drawer-item" data-id="${c.id}">${c.name}</button></li>`,
              )
              .join('') || '<li class="muted">No widgets available</li>'}
          </ul>
          <div class="modal-actions">
            <button type="button" class="taskbar-btn" data-modal-close>Close</button>
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
}
