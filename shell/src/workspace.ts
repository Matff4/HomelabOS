import type { ComponentInfo, LayoutItem, SystemConfig } from './types';
import { accentColor, fetchComponents, saveLayout, shellSSE } from './api';
import { widgetQuery } from './geometry';

/** Full-bleed widget layout (GridStack deferred until multi-widget edit mode). */
export class Workspace {
  private editMode = false;
  private components = new Map<string, ComponentInfo>();
  private layout: LayoutItem[] = [];
  private config: SystemConfig | null = null;
  private stage: HTMLElement | null = null;

  constructor(
    private readonly viewport: HTMLElement,
    private readonly slider: HTMLElement,
    private readonly onEditChange: (enabled: boolean) => void,
  ) {}

  async init(config: SystemConfig, layout: LayoutItem[]): Promise<void> {
    this.config = config;
    this.layout = layout;
    this.components = new Map((await fetchComponents()).map((c) => [c.id, c]));
    this.render();
  }

  setEditMode(enabled: boolean): void {
    this.editMode = enabled;
    document.body.classList.toggle('edit-mode', enabled);
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
    if (!demo || !this.config) return;
    const item: LayoutItem = {
      instance_id: `inst_${Date.now()}`,
      component_id: demo.id,
      x: 0,
      y: 0,
      w: 12,
      h: 2,
      pane: 0,
      config: {},
    };
    this.layout.push(item);
    await saveLayout(this.layout);
    this.render();
  }

  private render(): void {
    if (!this.config) return;
    this.slider.innerHTML = '';
    this.stage = document.createElement('div');
    this.stage.className = 'widget-stage';
    this.slider.appendChild(this.stage);

    const paneItems = this.layout.filter((item) => item.pane === 0);
    if (paneItems.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'widget-empty';
      empty.textContent = 'No widgets on this pane.';
      this.stage.appendChild(empty);
      return;
    }

    paneItems.forEach((item) => {
      const component = this.components.get(item.component_id);
      if (component) this.mountWidget(item, component);
    });
  }

  private mountWidget(item: LayoutItem, component: ComponentInfo): void {
    if (!this.config || !this.stage) return;

    const panel = document.createElement('article');
    panel.className = 'widget-panel';
    panel.dataset.instanceId = item.instance_id;

    const header = document.createElement('div');
    header.className = 'widget-header';
    header.textContent = component.name;

    const iframe = document.createElement('iframe');
    iframe.className = 'widget-iframe';
    iframe.setAttribute(
      'src',
      `${component.entry_url}?${widgetQuery(this.config, item.instance_id)}`,
    );
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('title', component.name);

    iframe.addEventListener('load', () => {
      shellSSE.registerIframe(iframe);
      iframe.contentWindow?.postMessage(
        { type: 'WIDGET_CONFIG', instanceId: item.instance_id, config: item.config },
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

    panel.appendChild(header);
    panel.appendChild(iframe);
    this.stage.appendChild(panel);
  }

  private async persistLayout(): Promise<void> {
    await saveLayout(this.layout);
  }
}
