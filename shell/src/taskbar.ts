import type { ComponentInfo, SystemConfig, SystemStats } from './types';
import { formatClock, formatStats } from './geometry';
import { shellSSE } from './api';
import { icon, icons } from './icons';

export class Taskbar {
  private config: SystemConfig;
  private clockTimer = 0;
  private components = new Map<string, ComponentInfo>();
  private appCloseHandler: (() => void) | null = null;

  constructor(
    private readonly root: HTMLElement,
    config: SystemConfig,
  ) {
    this.config = config;
    this.render();
    this.startClock();
    this.bindSseStatus();
    this.root.querySelector('#btn-app-close')?.addEventListener('click', () => {
      this.appCloseHandler?.();
    });
  }

  private render(): void {
    this.root.className = `top-bar size-${this.config.barHeight}`;
    this.root.innerHTML = `
      <div class="taskbar-section taskbar-left">
        <span class="os-title" id="os-title-home">Homelab OS</span>
        <nav class="app-breadcrumb" id="app-breadcrumb" hidden>
          <span class="breadcrumb-root">Homelab OS</span>
          <span class="breadcrumb-sep" aria-hidden="true">&gt;</span>
          <span class="breadcrumb-app" id="breadcrumb-app-name"></span>
        </nav>
        <span class="sse-dot" id="sse-dot" title="Event stream"></span>
      </div>
      <div class="taskbar-section taskbar-center">
        <div class="pane-controls" id="pane-controls" hidden>
          <button type="button" class="taskbar-btn pane-btn" id="btn-pane-prev" title="Previous page">
            ${icon(icons.chevronLeft)}
          </button>
          <span class="pane-indicator" id="pane-indicator">1 / 1</span>
          <button type="button" class="taskbar-btn pane-btn" id="btn-pane-next" title="Next page">
            ${icon(icons.chevronRight)}
          </button>
          <button type="button" class="taskbar-btn edit-only-btn pane-add-btn" id="btn-pane-add" title="Add page">
            ${icon(icons.addPane)}
          </button>
        </div>
      </div>
      <div class="taskbar-section taskbar-right">
        <div class="stat-container">
          <div class="stat-badge" id="stat-cpu">${icon(icons.cpu)}<span>--%</span></div>
          <div class="stat-badge" id="stat-ram">${icon(icons.ram)}<span>--</span></div>
        </div>
        <div class="controls-container">
          <button type="button" class="taskbar-btn app-close-btn" id="btn-app-close" title="Close app" hidden>
            ${icon(icons.close)}
          </button>
          <button type="button" class="taskbar-btn edit-only-btn" id="btn-add" title="Add to dashboard">
            ${icon(icons.add)}
          </button>
          <button type="button" class="taskbar-btn" id="btn-edit" title="Edit layout">
            ${icon(icons.edit)}
          </button>
          <button type="button" class="taskbar-btn" id="btn-store" title="Plugin store">
            ${icon(icons.store)}
          </button>
          <button type="button" class="taskbar-btn" id="btn-settings" title="Settings">
            ${icon(icons.settings)}
          </button>
          <button type="button" class="taskbar-btn" id="btn-power" title="Power">
            ${icon(icons.power)}
          </button>
        </div>
        <div class="clock" id="clock">--:--</div>
      </div>
    `;
  }

  updateConfig(config: SystemConfig): void {
    this.config = config;
    this.root.className = `top-bar size-${config.barHeight}`;
  }

  setComponents(components: ComponentInfo[]): void {
    this.components = new Map(components.map((row) => [row.id, row]));
  }

  getComponent(id: string): ComponentInfo | undefined {
    return this.components.get(id);
  }

  /** Fullscreen app open — breadcrumb in taskbar, hide stats, show close. */
  setAppContext(appName: string | null, onClose?: () => void): void {
    const home = this.root.querySelector('#os-title-home') as HTMLElement | null;
    const crumb = this.root.querySelector('#app-breadcrumb') as HTMLElement | null;
    const nameEl = this.root.querySelector('#breadcrumb-app-name');
    const closeBtn = this.root.querySelector('#btn-app-close') as HTMLElement | null;

    this.appCloseHandler = onClose ?? null;

    if (appName) {
      home?.setAttribute('hidden', '');
      crumb?.removeAttribute('hidden');
      if (nameEl) nameEl.textContent = appName;
      closeBtn?.removeAttribute('hidden');
      this.root.classList.add('app-context');
    } else {
      home?.removeAttribute('hidden');
      crumb?.setAttribute('hidden', '');
      if (nameEl) nameEl.textContent = '';
      closeBtn?.setAttribute('hidden', '');
      this.root.classList.remove('app-context');
    }
  }

  onAddWidget(handler: () => void): void {
    this.root.querySelector('#btn-add')?.addEventListener('click', handler);
  }

  onEditToggle(handler: () => void): void {
    this.root.querySelector('#btn-edit')?.addEventListener('click', handler);
  }

  onSettings(handler: () => void): void {
    this.root.querySelector('#btn-settings')?.addEventListener('click', handler);
  }

  onStore(handler: () => void): void {
    this.root.querySelector('#btn-store')?.addEventListener('click', handler);
  }

  onPower(handler: () => void): void {
    this.root.querySelector('#btn-power')?.addEventListener('click', handler);
  }

  onPanePrev(handler: () => void): void {
    this.root.querySelector('#btn-pane-prev')?.addEventListener('click', handler);
  }

  onPaneNext(handler: () => void): void {
    this.root.querySelector('#btn-pane-next')?.addEventListener('click', handler);
  }

  onAddPane(handler: () => void): void {
    this.root.querySelector('#btn-pane-add')?.addEventListener('click', handler);
  }

  setPaneIndicator(active: number, total: number): void {
    const controls = this.root.querySelector('#pane-controls') as HTMLElement | null;
    const label = this.root.querySelector('#pane-indicator');
    if (controls) controls.hidden = total <= 1;
    if (label) label.textContent = `${active + 1} / ${total}`;
  }

  setEditActive(active: boolean): void {
    this.root.querySelector('#btn-edit')?.classList.toggle('active', active);
  }

  bindStats(): void {
    shellSSE.onMessage((message) => {
      if (message.channel !== 'system.stats') return;
      this.renderStats(message.data as unknown as SystemStats);
    });
  }

  private renderStats(stats: SystemStats): void {
    const formatted = formatStats(stats, this.config);
    const cpuEl = this.root.querySelector('#stat-cpu span:last-child');
    const ramEl = this.root.querySelector('#stat-ram span:last-child');
    if (cpuEl) cpuEl.textContent = formatted.cpu.trim();
    if (ramEl) ramEl.textContent = formatted.ram.trim();
  }

  private startClock(): void {
    const tick = () => {
      const el = this.root.querySelector('#clock');
      if (el) el.textContent = formatClock(this.config);
    };
    tick();
    this.clockTimer = window.setInterval(tick, 1000);
  }

  private bindSseStatus(): void {
    const update = () => {
      const dot = this.root.querySelector('#sse-dot');
      dot?.classList.toggle('connected', shellSSE.isConnected());
    };
    document.addEventListener('homelabos:sse-status', update);
    update();
  }
}
