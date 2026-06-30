import { GridStack } from 'gridstack';
import type { ComponentInfo, LayoutItem, SystemConfig } from './types';
import { accentColor, fetchComponents, saveLayout, shellSSE } from './api';
import { calculateGridGeometry, GRID_COLS, GRID_ROWS, themeQuery } from './geometry';

export class Workspace {
  private grid: GridStack | null = null;
  private editMode = false;
  private components = new Map<string, ComponentInfo>();
  private layout: LayoutItem[] = [];
  private config: SystemConfig | null = null;

  constructor(
    private readonly viewport: HTMLElement,
    private readonly slider: HTMLElement,
    private readonly onEditChange: (enabled: boolean) => void,
  ) {}

  async init(config: SystemConfig, layout: LayoutItem[]): Promise<void> {
    this.config = config;
    this.layout = layout;
    this.components = new Map((await fetchComponents()).map((c) => [c.id, c]));
    this.renderPane(0);
    window.addEventListener('resize', () => this.reflow());
  }

  setEditMode(enabled: boolean): void {
    this.editMode = enabled;
    document.body.classList.toggle('edit-mode', enabled);
    this.grid?.setStatic(!enabled);
    this.onEditChange(enabled);
    if (!enabled) void this.persistLayout();
  }

  toggleEditMode(): void {
    this.setEditMode(!this.editMode);
  }

  isEditMode(): boolean {
    return this.editMode;
  }

  async addDemoWidget(): Promise<void> {
    const demo = this.components.get('demo_widget');
    if (!demo || !this.grid || !this.config) return;
    const instanceId = `inst_${Date.now()}`;
    const item: LayoutItem = {
      instance_id: instanceId,
      component_id: demo.id,
      x: 0,
      y: 0,
      w: demo.size?.w ?? 2,
      h: demo.size?.h ?? 2,
      pane: 0,
      config: {},
    };
    this.mountWidget(item, demo);
    this.layout.push(item);
    await saveLayout(this.layout);
  }

  private renderPane(paneIndex: number): void {
    if (!this.config) return;
    this.slider.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'pane-wrapper';
    const gridEl = document.createElement('div');
    gridEl.className = 'grid-stack';
    gridEl.id = 'grid-0';
    wrapper.appendChild(gridEl);
    this.slider.appendChild(wrapper);

    const geo = calculateGridGeometry(this.config);
    gridEl.style.width = `${geo.containerW}px`;

    this.grid = GridStack.init(
      {
        cellHeight: geo.cellH,
        margin: geo.gap,
        column: GRID_COLS,
        minRow: GRID_ROWS,
        maxRow: GRID_ROWS,
        float: true,
        staticGrid: !this.editMode,
        disableOneColumnMode: true,
      },
      gridEl,
    );

    this.grid.on('change', () => {
      if (this.editMode) void this.persistLayout();
    });

    const paneItems = this.layout.filter((item) => item.pane === paneIndex);
    paneItems.forEach((item) => {
      const component = this.components.get(item.component_id);
      if (component) this.mountWidget(item, component);
    });
  }

  private mountWidget(item: LayoutItem, component: ComponentInfo): void {
    if (!this.grid || !this.config) return;

    const content = document.createElement('div');
    content.className = 'widget-card';

    const header = document.createElement('div');
    header.className = 'widget-header';
    header.textContent = component.name;

    const iframe = document.createElement('iframe');
    iframe.className = 'widget-iframe';
    iframe.setAttribute(
      'src',
      `${component.entry_url}?${themeQuery(this.config)}&instance=${encodeURIComponent(item.instance_id)}`,
    );
    iframe.setAttribute('loading', 'lazy');

    iframe.addEventListener('load', () => {
      shellSSE.registerIframe(iframe);
      iframe.contentWindow?.postMessage(
        {
          type: 'WIDGET_CONFIG',
          instanceId: item.instance_id,
          config: item.config,
        },
        '*',
      );
      iframe.contentWindow?.postMessage(
        {
          type: 'OS_THEME_UPDATE',
          theme: this.config!.theme,
          accent: accentColor(this.config!),
        },
        '*',
      );
    });

    content.appendChild(header);
    content.appendChild(iframe);

    this.grid.addWidget({
      id: item.instance_id,
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
      content,
    });
  }

  private async persistLayout(): Promise<void> {
    if (!this.grid) return;
    const nodes = this.grid.engine.nodes;
    const byId = new Map(this.layout.map((item) => [item.instance_id, item]));
    const next: LayoutItem[] = [];

    nodes.forEach((node) => {
      const instanceId = node.id;
      if (!instanceId) return;
      const existing = byId.get(instanceId);
      if (!existing) return;
      next.push({
        ...existing,
        x: node.x ?? existing.x,
        y: node.y ?? existing.y,
        w: node.w ?? existing.w,
        h: node.h ?? existing.h,
        pane: 0,
      });
    });

    this.layout = next;
    await saveLayout(next);
  }

  private reflow(): void {
    if (!this.config || !this.grid) return;
    const geo = calculateGridGeometry(this.config);
    const gridEl = this.slider.querySelector('.grid-stack') as HTMLElement | null;
    if (gridEl) gridEl.style.width = `${geo.containerW}px`;
    this.grid.cellHeight(geo.cellH);
    this.grid.margin(geo.gap);
  }
}
