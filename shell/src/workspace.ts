import { GridStack } from 'gridstack';
import type { ComponentInfo, LayoutItem, SystemConfig } from './types';
import type { GridCapacity, GridSpec } from './geometry';
import {
  accentColor,
  fetchComponents,
  saveLayout,
  shellSSE,
} from './api';
import {
  clampLayoutItem,
  computeGridCapacity,
  computeGridSpec,
  applyGridSpecToDocument,
  getBrowserViewport,
  gridCapacityKey,
  taskbarHeight,
  widgetQuery,
} from './geometry';

export class Workspace {
  private grid: GridStack | null = null;
  private editMode = false;
  private components = new Map<string, ComponentInfo>();
  private layout: LayoutItem[] = [];
  private config: SystemConfig | null = null;
  private spec: GridSpec | null = null;
  private capacity: GridCapacity | null = null;
  private gridEl: HTMLElement | null = null;
  private physicalW = 0;
  private physicalH = 0;
  private renderW = 0;
  private renderH = 0;

  constructor(
    private readonly slider: HTMLElement,
    private readonly onEditChange: (enabled: boolean) => void,
  ) {}

  async init(
    config: SystemConfig,
    layout: LayoutItem[],
    physical: { width: number; height: number },
    render: { width: number; height: number },
  ): Promise<void> {
    this.config = config;
    this.physicalW = physical.width;
    this.physicalH = physical.height;
    this.renderW = render.width;
    this.renderH = render.height;
    this.components = new Map((await fetchComponents()).map((c) => [c.id, c]));

    const capacity = this.currentCapacity(config);
    this.layout = layout.map((item) => clampLayoutItem(item, capacity));
    this.renderGrid();

    window.addEventListener('resize', () => this.onResize());
    shellSSE.onMessage((message) => {
      if (message.channel !== 'system.display') return;
      const data = message.data as { width?: number; height?: number };
      if (typeof data.width === 'number' && typeof data.height === 'number') {
        this.setPhysicalDisplay(data.width, data.height);
      }
    });
  }

  updateConfig(config: SystemConfig): void {
    const prevBar = this.config ? taskbarHeight(this.config) : 0;
    this.config = config;
    const nextBar = taskbarHeight(config);
    if (nextBar !== prevBar) {
      this.renderGrid();
      return;
    }
    this.broadcastTheme();
  }

  setPhysicalDisplay(width: number, height: number): void {
    if (width === this.physicalW && height === this.physicalH) return;
    this.physicalW = width;
    this.physicalH = height;
    this.renderGrid();
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

  getSpec(): GridSpec | null {
    return this.spec;
  }

  getCapacity(): GridCapacity | null {
    return this.capacity;
  }

  async addWidget(component: ComponentInfo): Promise<void> {
    if (!this.config || !this.spec) return;
    const size = component.size ?? { w: 3, h: 1 };
    const min = component.min_size ?? size;
    const item: LayoutItem = {
      instance_id: `inst_${Date.now()}`,
      component_id: component.id,
      x: 0,
      y: 0,
      w: Math.min(size.w, this.spec.cols),
      h: Math.min(Math.max(size.h, min.h), this.spec.rows),
      pane: 0,
      config: {},
    };
    this.layout.push(clampLayoutItem(item, this.spec));
    await saveLayout(this.layout);
    this.mountWidget(item, component);
  }

  private currentCapacity(config: SystemConfig): GridCapacity {
    return computeGridCapacity(this.physicalW, this.physicalH, taskbarHeight(config));
  }

  private currentSpec(config: SystemConfig): GridSpec {
    const capacity = this.currentCapacity(config);
    return computeGridSpec(capacity, this.renderW, this.renderH, taskbarHeight(config));
  }

  private onResize(): void {
    if (!this.config) return;
    const render = getBrowserViewport();
    this.renderW = render.width;
    this.renderH = render.height;

    const next = this.currentSpec(this.config);
    const capacityChanged =
      !this.capacity || gridCapacityKey(next) !== gridCapacityKey(this.capacity);

    if (capacityChanged) {
      this.renderGrid();
      return;
    }

    if (!this.spec || next.cellH !== this.spec.cellH) {
      this.applySpecToGrid(next);
    }
  }

  private renderGrid(): void {
    if (!this.config) return;

    const capacity = this.currentCapacity(this.config);
    const spec = computeGridSpec(capacity, this.renderW, this.renderH, taskbarHeight(this.config));
    const capacityChanged =
      !this.capacity || gridCapacityKey(capacity) !== gridCapacityKey(this.capacity);

    this.capacity = capacity;
    this.spec = spec;
    this.layout = this.layout.map((item) => clampLayoutItem(item, capacity));
    applyGridSpecToDocument(spec);

    if (this.grid && !capacityChanged) {
      this.applySpecToGrid(spec);
      return;
    }

    if (this.grid) {
      this.grid.destroy(false);
      this.grid = null;
    }

    this.slider.innerHTML = '';
    const stage = document.createElement('div');
    stage.className = 'grid-stage';
    this.gridEl = document.createElement('div');
    this.gridEl.className = 'grid-stack';
    this.gridEl.id = 'workspace-grid';
    stage.appendChild(this.gridEl);
    this.slider.appendChild(stage);

    this.grid = GridStack.init(
      {
        column: spec.cols,
        cellHeight: spec.cellH,
        margin: spec.gap,
        minRow: spec.rows,
        maxRow: spec.rows,
        float: true,
        staticGrid: !this.editMode,
        animate: false,
        disableOneColumnMode: true,
      },
      this.gridEl,
    );

    this.grid.on('change', () => {
      if (this.editMode) void this.persistLayout();
    });

    const paneItems = this.layout.filter((item) => item.pane === 0);
    if (paneItems.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'widget-empty';
      empty.textContent = 'No widgets — tap Edit, then + to add one.';
      stage.appendChild(empty);
      return;
    }

    paneItems.forEach((item) => {
      const component = this.components.get(item.component_id);
      if (component) this.mountWidget(item, component);
    });
  }

  private applySpecToGrid(spec: GridSpec): void {
    this.spec = spec;
    applyGridSpecToDocument(spec);
    if (!this.grid) return;
    this.grid.column(spec.cols);
    this.grid.cellHeight(spec.cellH);
    this.grid.margin(spec.gap);
  }

  private mountWidget(item: LayoutItem, component: ComponentInfo): void {
    if (!this.grid || !this.config || !this.spec) return;

    const clamped = clampLayoutItem(item, this.spec);
    const content = document.createElement('div');
    content.className = 'widget-card';

    const header = document.createElement('div');
    header.className = 'widget-header';
    header.textContent = component.name;

    const iframe = document.createElement('iframe');
    iframe.className = 'widget-iframe';
    iframe.setAttribute(
      'src',
      `${component.entry_url}?${widgetQuery(this.config, clamped.instance_id)}`,
    );
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('title', component.name);

    iframe.addEventListener('load', () => {
      shellSSE.registerIframe(iframe);
      iframe.contentWindow?.postMessage(
        { type: 'WIDGET_CONFIG', instanceId: clamped.instance_id, config: clamped.config },
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
      id: clamped.instance_id,
      x: clamped.x,
      y: clamped.y,
      w: clamped.w,
      h: clamped.h,
    });

    const mountContent = (): void => {
      const node = this.grid!.engine.nodes.find((n) => n.id === clamped.instance_id);
      const slot = node?.el?.querySelector('.grid-stack-item-content');
      if (!slot) return;
      slot.innerHTML = '';
      slot.appendChild(content);
    };
    mountContent();
    if (!content.isConnected) requestAnimationFrame(mountContent);
  }

  private broadcastTheme(): void {
    if (!this.config) return;
    this.slider.querySelectorAll<HTMLIFrameElement>('iframe.widget-iframe').forEach((iframe) => {
      iframe.contentWindow?.postMessage(
        {
          type: 'OS_THEME_UPDATE',
          theme: this.config!.theme,
          accent: accentColor(this.config!),
        },
        '*',
      );
    });
  }

  private async persistLayout(): Promise<void> {
    if (!this.grid || !this.capacity) return;
    const byId = new Map(this.layout.map((item) => [item.instance_id, item]));
    const next: LayoutItem[] = [];

    this.grid.engine.nodes.forEach((node) => {
      if (!node.id) return;
      const existing = byId.get(node.id);
      if (!existing) return;
      next.push(
        clampLayoutItem(
          {
            ...existing,
            x: node.x ?? existing.x,
            y: node.y ?? existing.y,
            w: node.w ?? existing.w,
            h: node.h ?? existing.h,
            pane: 0,
          },
          this.capacity!,
        ),
      );
    });

    this.layout = next;
    await saveLayout(next);
  }
}
