import type { ComponentInfo, SystemConfig, SystemStats } from './types';
import { formatClock, formatStats } from './geometry';
import { shellSSE } from './api';
import { icon, icons } from './icons';

export class Taskbar {
  private config: SystemConfig;
  private clockTimer = 0;
  private components = new Map<string, ComponentInfo>();
  private actionHandler: ((componentId: string) => void) | null = null;

  constructor(
    private readonly root: HTMLElement,
    config: SystemConfig,
  ) {
    this.config = config;
    this.render();
    this.startClock();
    this.bindSseStatus();
    this.root.querySelector('#taskbar-actions')?.addEventListener('click', (event) => {
      const btn = (event.target as Element).closest('[data-action-id]');
      if (!btn) return;
      const id = (btn as HTMLElement).dataset.actionId;
      if (id) this.actionHandler?.(id);
    });
  }

  private render(): void {
    this.root.className = `top-bar size-${this.config.barHeight}`;
    this.root.innerHTML = `
      <div class="taskbar-section taskbar-left">
        <span class="os-title">Homelab OS</span>
        <div class="taskbar-actions" id="taskbar-actions"></div>
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
    this.refreshActions();
  }

  setComponents(components: ComponentInfo[]): void {
    this.components = new Map(components.map((row) => [row.id, row]));
    this.refreshActions();
  }

  refreshActions(): void {
    const container = this.root.querySelector('#taskbar-actions');
    if (!container) return;

    const ids = this.config.taskbarActions ?? [];
    container.innerHTML = ids
      .map((id) => {
        const component = this.components.get(id);
        if (!component || component.type !== 'action') return '';
        const mode = component.action_mode === 'toggle' ? 'Toggle' : 'Button';
        const glyph = component.icon || icons.smartButton;
        return `<button type="button" class="taskbar-btn taskbar-action-btn" data-action-id="${id}" title="${component.name} (${mode})">${icon(glyph)}</button>`;
      })
      .join('');
  }

  getComponent(id: string): ComponentInfo | undefined {
    return this.components.get(id);
  }

  onActionClick(handler: (componentId: string) => void): void {
    this.actionHandler = handler;
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
