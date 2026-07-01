import type { ComponentInfo } from './types';
import { icon, icons } from './icons';

export interface AddDrawerHandlers {
  onWidget: (component: ComponentInfo) => void;
  onApp: (component: ComponentInfo) => void;
  onAction: (component: ComponentInfo) => void;
}

function typeLabel(component: ComponentInfo): string {
  if (component.type === 'widget') return 'Widget';
  if (component.type === 'app') return 'App';
  return component.action_mode === 'toggle' ? 'Toggle' : 'Button';
}

function typeIcon(component: ComponentInfo): string {
  if (component.type === 'widget') return component.icon || icons.widget;
  if (component.type === 'app') return component.icon || icons.app;
  return component.icon || icons.smartButton;
}

function renderTile(component: ComponentInfo): string {
  return `<button type="button" class="add-tile" data-id="${component.id}" data-type="${component.type}">
    <span class="add-tile-icon">${icon(typeIcon(component))}</span>
    <span class="add-tile-name">${component.name}</span>
    <span class="add-tile-type">${typeLabel(component)}</span>
  </button>`;
}

function renderSection(title: string, items: ComponentInfo[]): string {
  if (items.length === 0) return '';
  return `<section class="add-section">
    <h3 class="add-section-title">${title}</h3>
    <div class="add-tile-grid">${items.map(renderTile).join('')}</div>
  </section>`;
}

export function renderAddDrawer(components: ComponentInfo[]): string {
  const widgets = components.filter((c) => c.type === 'widget');
  const actions = components.filter((c) => c.type === 'action');
  const apps = components.filter((c) => c.type === 'app');

  const body =
    renderSection('Widgets', widgets) +
    renderSection('Buttons', actions) +
    renderSection('Apps', apps);

  return `
    <div class="modal-backdrop">
      <div class="modal-card modal-add-drawer">
        <div class="modal-header">
          <h2>Add to dashboard</h2>
          <button type="button" class="taskbar-btn modal-close-btn" data-modal-close title="Close">
            ${icon(icons.close)}
          </button>
        </div>
        <div class="modal-body add-drawer-body">
          ${body || '<p class="muted">Nothing available — install plugins from the store.</p>'}
        </div>
        <div class="modal-footer">
          <button type="button" class="modal-btn" data-modal-close>Close</button>
        </div>
      </div>
    </div>
  `;
}

export function bindAddDrawer(root: HTMLElement, components: ComponentInfo[], handlers: AddDrawerHandlers): void {
  root.querySelectorAll('.add-tile').forEach((btn) => {
    btn.addEventListener('click', () => {
      const el = btn as HTMLElement;
      const id = el.dataset.id;
      const type = el.dataset.type;
      const component = components.find((row) => row.id === id);
      if (!component) return;

      if (type === 'widget') handlers.onWidget(component);
      else if (type === 'app') handlers.onApp(component);
      else if (type === 'action') handlers.onAction(component);
    });
  });
}
