import type { SystemConfig, SystemStats } from './types';
import { formatClock, formatStats } from './geometry';
import { shellSSE } from './api';

export class Taskbar {
  private config: SystemConfig;
  private clockTimer = 0;

  constructor(
    private readonly root: HTMLElement,
    config: SystemConfig,
  ) {
    this.config = config;
    this.root.className = `top-bar size-${config.barHeight}`;
    this.root.innerHTML = `
      <div class="taskbar-left">
        <span class="os-title">HomelabOS</span>
        <span class="sse-dot" id="sse-dot" title="Event stream"></span>
      </div>
      <div class="taskbar-right">
        <div class="stat-badge" id="stat-cpu">CPU --%</div>
        <div class="stat-badge" id="stat-ram">RAM --</div>
        <button type="button" class="taskbar-btn edit-only" id="btn-add-widget" title="Add demo widget">+</button>
        <button type="button" class="taskbar-btn" id="btn-edit" title="Edit layout">Edit</button>
        <div class="clock" id="clock">--:--</div>
      </div>
    `;
    this.startClock();
    this.bindSseStatus();
  }

  onAddWidget(handler: () => void): void {
    this.root.querySelector('#btn-add-widget')?.addEventListener('click', handler);
  }

  onEditToggle(handler: () => void): void {
    this.root.querySelector('#btn-edit')?.addEventListener('click', handler);
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
    const cpuEl = this.root.querySelector('#stat-cpu');
    const ramEl = this.root.querySelector('#stat-ram');
    if (cpuEl) cpuEl.textContent = `CPU ${formatted.cpu}`;
    if (ramEl) ramEl.textContent = `RAM ${formatted.ram}`;
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
