import { GridStack } from 'gridstack';
import type { ComponentInfo, LayoutItem, PlatformInfo, SystemConfig } from './types';
import type { GridCapacity, GridSpec } from './geometry';
import type { Modals } from './modals';
import {
  accentColor,
  fetchComponents,
  fetchLayout,
  patchWidgetConfig,
  saveConfig,
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
  gridHeight,
  MIN_CELL,
  TILE_MARGIN,
  taskbarHeight,
  widgetQuery,
} from './geometry';
import { icon, icons } from './icons';
import { fetchActionActive, invokePluginAction } from './actions';
import { showToast } from './toast';

const MAX_PANES = 8;

function widgetTitle(item: LayoutItem, component: ComponentInfo): string {
  const custom = item.config?.title;
  if (typeof custom === 'string' && custom.trim()) return custom.trim();
  return component.name;
}

export class Workspace {
  private editMode = false;
  private components = new Map<string, ComponentInfo>();
  private layout: LayoutItem[] = [];
  private config: SystemConfig | null = null;
  private platform: PlatformInfo | null = null;
  private spec: GridSpec | null = null;
  private capacity: GridCapacity | null = null;
  private physicalW = 0;
  private physicalH = 0;
  private renderW = 0;
  private renderH = 0;
  private activePane = 0;
  private paneCount = 1;
  private trackEl: HTMLElement | null = null;
  private grids = new Map<number, GridStack>();
  private gridEls = new Map<number, HTMLElement>();
  private iframeByInstance = new Map<string, HTMLIFrameElement>();
  private instancePane = new Map<string, number>();
  private messageHandler: ((event: MessageEvent) => void) | null = null;
  private paneSwipe = {
    tracking: false,
    dragging: false,
    startX: 0,
    startY: 0,
    startTime: 0,
    pointerId: -1,
  };
  /** Suppress accidental launch when a tile was just placed from the add drawer. */
  private launcherArmUntil = new Map<string, number>();

  constructor(
    private readonly slider: HTMLElement,
    private readonly modals: Modals,
    private readonly onEditChange: (enabled: boolean) => void,
    private readonly onPaneChange: (active: number, total: number) => void,
    private readonly openApp: (component: ComponentInfo) => void,
  ) {}

  async init(
    config: SystemConfig,
    layout: LayoutItem[],
    platform: PlatformInfo,
    physical: { width: number; height: number },
    render: { width: number; height: number },
  ): Promise<void> {
    this.config = config;
    this.platform = platform;
    this.physicalW = physical.width;
    this.physicalH = physical.height;
    this.renderW = render.width;
    this.renderH = render.height;
    this.paneCount = this.resolvePaneCount(config, layout);
    this.components = new Map((await fetchComponents()).map((c) => [c.id, c]));

    const capacity = this.currentCapacity(config);
    this.layout = layout.map((item) => clampLayoutItem(item, capacity));
    await this.pruneOrphanLayout();
    this.renderGrid();
    this.bindPaneSwipe();

    window.addEventListener('resize', () => this.onResize());
    shellSSE.onMessage((message) => {
      if (message.channel !== 'system.display') return;
      const data = message.data as { width?: number; height?: number };
      if (typeof data.width === 'number' && typeof data.height === 'number') {
        this.setPhysicalDisplay(data.width, data.height);
      }
    });

    this.messageHandler = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'SAVE_WIDGET_CONFIG' && typeof data.instanceId === 'string') {
        void this.applyWidgetConfig(data.instanceId, (data.config as Record<string, unknown>) ?? {});
      }
    };
    window.addEventListener('message', this.messageHandler);
  }

  updateConfig(config: SystemConfig): void {
    const prevBar = this.config ? taskbarHeight(this.config) : 0;
    const prevPanes = this.paneCount;
    this.config = config;
    this.paneCount = this.resolvePaneCount(config, this.layout);
    const nextBar = taskbarHeight(config);
    if (nextBar !== prevBar || prevPanes !== this.paneCount) {
      this.renderGrid();
      return;
    }
    this.broadcastTheme();
    this.refreshWidgetTitles();
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
    this.grids.forEach((grid) => grid.setStatic(!enabled));
    this.onEditChange(enabled);
    if (!enabled) void this.persistAllPanes();
  }

  toggleEditMode(): void {
    this.setEditMode(!this.editMode);
  }

  isEditMode(): boolean {
    return this.editMode;
  }

  getPaneState(): { active: number; total: number } {
    return { active: this.activePane, total: this.paneCount };
  }

  switchPane(index: number): void {
    if (index < 0 || index >= this.paneCount || index === this.activePane) return;
    this.activePane = index;
    this.applyPaneTransform();
    this.onPaneChange(this.activePane, this.paneCount);
  }

  nextPane(): void {
    this.switchPane((this.activePane + 1) % this.paneCount);
  }

  prevPane(): void {
    this.switchPane((this.activePane - 1 + this.paneCount) % this.paneCount);
  }

  async addPane(): Promise<void> {
    if (!this.config || this.paneCount >= MAX_PANES) return;
    this.paneCount += 1;
    this.config = { ...this.config, paneCount: this.paneCount };
    await saveConfig(this.config);
    this.activePane = this.paneCount - 1;
    this.renderGrid();
    this.onPaneChange(this.activePane, this.paneCount);
  }

  async addGridItem(component: ComponentInfo): Promise<void> {
    if (!this.config || !this.spec) return;
    const size =
      component.type === 'widget'
        ? (component.size ?? { w: 3, h: 1 })
        : { w: 1, h: 1 };
    const min = component.type === 'widget' ? (component.min_size ?? size) : { w: 1, h: 1 };
    const item: LayoutItem = {
      instance_id: `inst_${Date.now()}`,
      component_id: component.id,
      x: 0,
      y: 0,
      w: Math.min(size.w, this.spec.cols),
      h: Math.min(Math.max(size.h, min.h), this.spec.rows),
      pane: this.activePane,
      config: {},
    };
    this.layout.push(clampLayoutItem(item, this.spec));
    await saveLayout(this.layout);
    this.clearPaneEmptyState(this.activePane);
    this.mountGridItem(item, component, this.activePane);
    if (component.type === 'app' || component.type === 'action') {
      this.armLauncher(item.instance_id);
    }
  }

  private armLauncher(instanceId: string, ms = 700): void {
    this.launcherArmUntil.set(instanceId, Date.now() + ms);
  }

  private isLauncherArmed(instanceId: string): boolean {
    const until = this.launcherArmUntil.get(instanceId);
    return until !== undefined && Date.now() < until;
  }

  /** @deprecated use addGridItem */
  async addWidget(component: ComponentInfo): Promise<void> {
    return this.addGridItem(component);
  }

  async applyWidgetConfig(
    instanceId: string,
    config: Record<string, unknown>,
  ): Promise<void> {
    const updated = await patchWidgetConfig(instanceId, config);
    this.layout = this.layout.map((item) =>
      item.instance_id === instanceId ? updated : item,
    );
    const iframe = this.iframeByInstance.get(instanceId);
    iframe?.contentWindow?.postMessage({ type: 'WIDGET_CONFIG_UPDATE', config }, '*');
    this.refreshWidgetTitle(instanceId);
  }

  async removeWidget(instanceId: string): Promise<void> {
    const pane = this.instancePane.get(instanceId) ?? 0;
    const grid = this.grids.get(pane);
    const node = grid?.engine.nodes.find((n) => n.id === instanceId);
    if (node?.el) grid?.removeWidget(node.el);
    this.layout = this.layout.filter((item) => item.instance_id !== instanceId);
    this.iframeByInstance.delete(instanceId);
    this.instancePane.delete(instanceId);
    await saveLayout(this.layout);
    this.ensurePaneEmptyState(pane);
  }

  async refreshPlugins(): Promise<void> {
    this.components = new Map((await fetchComponents()).map((c) => [c.id, c]));
    this.layout = await fetchLayout();
    await this.pruneOrphanLayout();
    this.renderGrid();
  }

  private async pruneOrphanLayout(): Promise<void> {
    const valid = new Set(this.components.keys());
    const pruned = this.layout.filter((item) => valid.has(item.component_id));
    if (pruned.length === this.layout.length) return;
    this.layout = pruned;
    await saveLayout(pruned);
  }

  private paneStage(pane: number): HTMLElement | null {
    return this.trackEl?.querySelector(`[data-pane="${pane}"] .grid-stage`) ?? null;
  }

  private clearPaneEmptyState(pane: number): void {
    this.paneStage(pane)?.querySelector('.widget-empty')?.remove();
  }

  private ensurePaneEmptyState(pane: number): void {
    const hasWidgets = this.layout.some((item) => item.pane === pane);
    if (hasWidgets) {
      this.clearPaneEmptyState(pane);
      return;
    }
    const stage = this.paneStage(pane);
    if (!stage || stage.querySelector('.widget-empty')) return;
    const empty = document.createElement('div');
    empty.className = 'widget-empty';
    empty.textContent =
      pane === this.activePane
        ? 'No items — tap Edit, then + to add one.'
        : 'Empty page';
    stage.appendChild(empty);
  }

  private resolvePaneCount(config: SystemConfig, layout: LayoutItem[]): number {
    const fromLayout = layout.reduce((max, item) => Math.max(max, item.pane + 1), 1);
    const fromConfig = config.paneCount ?? 1;
    return Math.min(MAX_PANES, Math.max(1, fromConfig, fromLayout));
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
      this.applySpecToAllGrids(next);
    }
  }

  private renderGrid(): void {
    if (!this.config) return;

    this.iframeByInstance.clear();
    this.instancePane.clear();
    this.grids.forEach((grid) => grid.destroy(false));
    this.grids.clear();
    this.gridEls.clear();

    const capacity = this.currentCapacity(this.config);
    const spec = computeGridSpec(capacity, this.renderW, this.renderH, taskbarHeight(this.config));
    const capacityChanged =
      !this.capacity || gridCapacityKey(capacity) !== gridCapacityKey(this.capacity);

    this.capacity = capacity;
    this.spec = spec;
    this.layout = this.layout.map((item) => {
      const comp = this.components.get(item.component_id);
      const sized =
        comp && comp.type !== 'widget' ? { ...item, w: 1, h: 1 } : item;
      return clampLayoutItem(sized, capacity);
    });
    applyGridSpecToDocument(spec);

    if (this.activePane >= this.paneCount) {
      this.activePane = Math.max(0, this.paneCount - 1);
    }

    this.slider.innerHTML = '';
    this.trackEl = document.createElement('div');
    this.trackEl.className = 'pane-track pane-animating';
    this.slider.appendChild(this.trackEl);

    for (let pane = 0; pane < this.paneCount; pane += 1) {
      this.buildPane(pane, spec);
    }

    this.applyPaneTransform();
    this.onPaneChange(this.activePane, this.paneCount);

    if (capacityChanged) {
      requestAnimationFrame(() => this.syncAllSquareCellSizes());
    } else {
      requestAnimationFrame(() => this.syncAllSquareCellSizes());
    }
  }

  private buildPane(pane: number, spec: GridSpec): void {
    const paneEl = document.createElement('div');
    paneEl.className = 'workspace-pane';
    paneEl.dataset.pane = String(pane);

    const stage = document.createElement('div');
    stage.className = 'grid-stage';

    const gridEl = document.createElement('div');
    gridEl.className = 'grid-stack';
    gridEl.id = `workspace-grid-${pane}`;
    stage.appendChild(gridEl);
    paneEl.appendChild(stage);
    this.trackEl!.appendChild(paneEl);
    this.gridEls.set(pane, gridEl);

    const grid = GridStack.init(
      {
        column: spec.cols,
        cellHeight: spec.cellH,
        margin: TILE_MARGIN,
        minRow: spec.rows,
        maxRow: spec.rows,
        float: true,
        staticGrid: !this.editMode,
        animate: false,
        disableOneColumnMode: true,
        draggable: { handle: '.widget-header, .grid-launcher-handle' },
      },
      gridEl,
    );

    this.applyGridSize(gridEl, spec);
    grid.on('change', () => {
      if (this.editMode) void this.persistPaneLayout(pane);
    });
    grid.on('resizestop', () => {
      if (this.spec) gridEl.style.height = `${this.spec.gridPixelH}px`;
    });

    this.grids.set(pane, grid);

    const paneItems = this.layout.filter((item) => item.pane === pane);
    if (paneItems.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'widget-empty';
      empty.textContent =
        pane === this.activePane
          ? 'No items — tap Edit, then + to add one.'
          : 'Empty page';
      stage.appendChild(empty);
      return;
    }

    paneItems.forEach((item) => {
      const component = this.components.get(item.component_id);
      if (component) this.mountGridItem(item, component, pane);
    });
  }

  private applyPaneTransform(): void {
    if (!this.trackEl) return;
    this.trackEl.classList.add('pane-animating');
    this.trackEl.style.transform = `translateX(-${this.activePane * 100}%)`;
    this.trackEl.querySelectorAll('.workspace-pane').forEach((el, index) => {
      el.classList.toggle('pane-active', index === this.activePane);
    });
  }

  private bindPaneSwipe(): void {
    const target = this.slider;

    const resetSwipe = (): void => {
      this.paneSwipe.tracking = false;
      this.paneSwipe.dragging = false;
      this.paneSwipe.pointerId = -1;
      document.body.classList.remove('pane-swiping');
      this.trackEl?.classList.remove('pane-dragging');
    };

    target.addEventListener('pointerdown', (event) => {
      if (this.editMode || this.paneCount <= 1) return;
      if (event.button !== 0) return;
      this.paneSwipe.tracking = true;
      this.paneSwipe.dragging = false;
      this.paneSwipe.startX = event.clientX;
      this.paneSwipe.startY = event.clientY;
      this.paneSwipe.startTime = Date.now();
      this.paneSwipe.pointerId = event.pointerId;
    });

    target.addEventListener(
      'pointermove',
      (event) => {
        if (!this.paneSwipe.tracking || event.pointerId !== this.paneSwipe.pointerId) return;

        const dx = event.clientX - this.paneSwipe.startX;
        const dy = event.clientY - this.paneSwipe.startY;

        if (!this.paneSwipe.dragging) {
          if (Math.abs(dx) < 14 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
          this.paneSwipe.dragging = true;
          document.body.classList.add('pane-swiping');
          this.trackEl?.classList.add('pane-dragging');
          this.trackEl?.classList.remove('pane-animating');
          target.setPointerCapture(event.pointerId);
        }

        if (!this.trackEl) return;
        const width = target.clientWidth || 1;
        const base = -this.activePane * width;
        let offset = base + dx;
        const min = -(this.paneCount - 1) * width;
        const max = 0;
        if (offset > max) offset = max + (offset - max) * 0.3;
        if (offset < min) offset = min + (offset - min) * 0.3;
        this.trackEl.style.transform = `translateX(${offset}px)`;
      },
      { passive: true },
    );

    const finishSwipe = (event: PointerEvent): void => {
      if (!this.paneSwipe.tracking || event.pointerId !== this.paneSwipe.pointerId) return;

      if (this.paneSwipe.dragging) {
        const dx = event.clientX - this.paneSwipe.startX;
        const dt = Math.max(Date.now() - this.paneSwipe.startTime, 1);
        const velocity = dx / dt;
        const width = target.clientWidth || 1;
        const threshold = width * 0.18;

        if (dx <= -threshold || velocity <= -0.55) this.nextPane();
        else if (dx >= threshold || velocity >= 0.55) this.prevPane();
        else this.applyPaneTransform();

        if (target.hasPointerCapture(event.pointerId)) {
          target.releasePointerCapture(event.pointerId);
        }
      }

      resetSwipe();
    };

    target.addEventListener('pointerup', finishSwipe);
    target.addEventListener('pointercancel', finishSwipe);
  }

  private applyGridSize(gridEl: HTMLElement, spec: GridSpec): void {
    gridEl.style.width = '100%';
    gridEl.style.maxWidth = `${spec.workspaceW}px`;
    gridEl.style.height = `${spec.gridPixelH}px`;
  }

  private syncAllSquareCellSizes(): void {
    if (!this.spec) return;
    this.grids.forEach((grid, pane) => {
      const gridEl = this.gridEls.get(pane);
      if (!gridEl) return;

      const colW = grid.cellWidth();
      if (!colW || colW < MIN_CELL - 2) return;

      const cell = Math.round(colW);
      if (Math.abs(cell - this.spec!.cellH) < 1) return;

      this.spec = {
        ...this.spec!,
        cellH: cell,
        gridPixelH: gridHeight(this.spec!.rows, cell, this.spec!.gap),
      };
      grid.cellHeight(cell);
      applyGridSpecToDocument(this.spec);
      gridEl.style.height = `${this.spec.gridPixelH}px`;
    });
  }

  private applySpecToAllGrids(spec: GridSpec): void {
    this.spec = spec;
    applyGridSpecToDocument(spec);
    this.grids.forEach((grid, pane) => {
      const gridEl = this.gridEls.get(pane);
      if (gridEl) this.applyGridSize(gridEl, spec);
      grid.column(spec.cols);
      grid.cellHeight(spec.cellH);
      grid.margin(TILE_MARGIN);
    });
    requestAnimationFrame(() => this.syncAllSquareCellSizes());
  }

  private mountGridItem(item: LayoutItem, component: ComponentInfo, pane: number): void {
    if (component.type === 'widget') {
      this.mountWidgetTile(item, component, pane);
    } else {
      this.mountLauncherTile(item, component, pane);
    }
  }

  private mountLauncherTile(item: LayoutItem, component: ComponentInfo, pane: number): void {
    const grid = this.grids.get(pane);
    if (!grid || !this.spec) return;

    const clamped = clampLayoutItem(
      { ...item, w: 1, h: 1 },
      this.spec,
    );
    this.instancePane.set(clamped.instance_id, pane);

    const isAction = component.type === 'action';
    const glyph = component.icon || (isAction ? icons.smartButton : icons.app);

    const content = document.createElement('div');
    content.className = `grid-launcher grid-launcher-handle${isAction ? ' grid-launcher-action' : ' grid-launcher-app'}`;

    content.innerHTML = `
      <button type="button" class="grid-launcher-hit" title="${component.name}">
        <span class="grid-launcher-icon">${icon(glyph)}</span>
        <span class="grid-launcher-label">${widgetTitle(clamped, component)}</span>
      </button>
      <button type="button" class="grid-launcher-delete" title="Remove">
        ${icon(icons.close)}
      </button>
    `;

    const activate = (): void => {
      if (this.editMode) return;
      if (this.isLauncherArmed(clamped.instance_id)) return;
      if (isAction) void this.handleLauncherAction(component, content);
      else this.openApp(component);
    };

    content.querySelector('.grid-launcher-hit')?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      activate();
    });

    content.querySelector('.grid-launcher-delete')?.addEventListener('click', (event) => {
      event.stopPropagation();
      void this.removeWidget(clamped.instance_id);
    });

    if (isAction && component.action_mode === 'toggle') {
      void fetchActionActive(component).then((active) => {
        content.classList.toggle('active', active);
      });
    }

    grid.addWidget({
      id: clamped.instance_id,
      x: clamped.x,
      y: clamped.y,
      w: 1,
      h: 1,
      noResize: true,
    });

    const mountContent = (): void => {
      const node = grid.engine.nodes.find((n) => n.id === clamped.instance_id);
      const slot = node?.el?.querySelector('.grid-stack-item-content');
      if (!slot) return;
      slot.innerHTML = '';
      slot.appendChild(content);
    };
    mountContent();
    if (!content.isConnected) requestAnimationFrame(mountContent);
  }

  private async handleLauncherAction(
    component: ComponentInfo,
    tile: HTMLElement,
  ): Promise<void> {
    try {
      const body = await invokePluginAction(component);
      if (component.action_mode === 'toggle') {
        tile.classList.toggle('active', Boolean(body.active));
      }
      const detail = body.state ? ` (${body.state})` : '';
      showToast(`${component.name}${detail}`, 'success');
    } catch {
      showToast(`${component.name}: action failed`, 'error');
    }
  }

  private mountWidgetTile(item: LayoutItem, component: ComponentInfo, pane: number): void {
    const grid = this.grids.get(pane);
    if (!grid || !this.config || !this.spec) return;

    const clamped = clampLayoutItem(item, this.spec);
    this.instancePane.set(clamped.instance_id, pane);

    const content = document.createElement('div');
    content.className = 'widget-card';

    const header = document.createElement('div');
    header.className = 'widget-header';
    const settingsBtn =
      component.settings && component.settings.length > 0
        ? `<button type="button" class="widget-settings-btn" title="Configure widget">
        ${icon(icons.settings)}
      </button>`
        : '';

    header.innerHTML = `
      ${icon(component.icon || icons.widget)}
      <span class="widget-title">${widgetTitle(clamped, component)}</span>
      ${settingsBtn}
      <button type="button" class="widget-delete-btn" title="Remove widget">
        ${icon(icons.close)}
      </button>
    `;

    header.querySelector('.widget-settings-btn')?.addEventListener('click', (event) => {
      event.stopPropagation();
      const layoutItem = this.layout.find((row) => row.instance_id === clamped.instance_id);
      if (!layoutItem || !component.settings?.length) return;
      this.modals.openWidgetSettings(
        widgetTitle(layoutItem, component),
        component.settings,
        layoutItem.config,
        (next) => this.applyWidgetConfig(clamped.instance_id, next),
      );
    });

    header.querySelector('.widget-delete-btn')?.addEventListener('click', (event) => {
      event.stopPropagation();
      void this.removeWidget(clamped.instance_id);
    });

    const iframe = document.createElement('iframe');
    iframe.className = 'widget-iframe';
    iframe.setAttribute(
      'src',
      `${component.entry_url}?${widgetQuery(this.config, clamped.instance_id, this.platform)}`,
    );
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('scrolling', 'no');
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

    this.iframeByInstance.set(clamped.instance_id, iframe);
    content.appendChild(header);
    content.appendChild(iframe);

    grid.addWidget({
      id: clamped.instance_id,
      x: clamped.x,
      y: clamped.y,
      w: clamped.w,
      h: clamped.h,
    });

    const mountContent = (): void => {
      const node = grid.engine.nodes.find((n) => n.id === clamped.instance_id);
      const slot = node?.el?.querySelector('.grid-stack-item-content');
      if (!slot) return;
      slot.innerHTML = '';
      slot.appendChild(content);
    };
    mountContent();
    if (!content.isConnected) requestAnimationFrame(mountContent);
  }

  private refreshWidgetTitles(): void {
    this.layout.forEach((item) => this.refreshWidgetTitle(item.instance_id));
  }

  private refreshWidgetTitle(instanceId: string): void {
    const item = this.layout.find((row) => row.instance_id === instanceId);
    const component = item ? this.components.get(item.component_id) : null;
    if (!item || !component) return;
    const pane = this.instancePane.get(instanceId) ?? item.pane;
    const grid = this.grids.get(pane);
    const node = grid?.engine.nodes.find((n) => n.id === instanceId);
    const titleEl = node?.el?.querySelector('.widget-title');
    if (titleEl) titleEl.textContent = widgetTitle(item, component);
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

  private async persistPaneLayout(pane: number): Promise<void> {
    const grid = this.grids.get(pane);
    if (!grid || !this.capacity) return;

    const byId = new Map(
      this.layout.filter((item) => item.pane === pane).map((item) => [item.instance_id, item]),
    );
    const updated: LayoutItem[] = [];

    grid.engine.nodes.forEach((node) => {
      if (!node.id) return;
      const existing = byId.get(node.id);
      if (!existing) return;
      updated.push(
        clampLayoutItem(
          {
            ...existing,
            x: node.x ?? existing.x,
            y: node.y ?? existing.y,
            w: node.w ?? existing.w,
            h: node.h ?? existing.h,
            pane,
          },
          this.capacity!,
        ),
      );
    });

    this.layout = [...this.layout.filter((item) => item.pane !== pane), ...updated];
    await saveLayout(this.layout);
  }

  private async persistAllPanes(): Promise<void> {
    for (const pane of this.grids.keys()) {
      await this.persistPaneLayout(pane);
    }
  }
}
