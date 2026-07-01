import 'gridstack/dist/gridstack.min.css';
import './styles/shell.css';

import type { ComponentInfo } from './types';
import {
  applyTheme,
  fetchComponents,
  fetchConfig,
  fetchDisplay,
  fetchLayout,
  fetchPlatform,
  saveConfig,
  shellSSE,
} from './api';
import { closeAppOverlay, openAppOverlay } from './app-overlay';
import {
  computeGridCapacity,
  getBrowserViewport,
  getPhysicalDisplay,
  taskbarHeight,
} from './geometry';
import { Modals } from './modals';
import { Taskbar } from './taskbar';
import { Workspace } from './workspace';

function syncBrowserViewport(): void {
  const { width, height } = getBrowserViewport();
  document.documentElement.style.setProperty('--vp-h', `${height}px`);
  document.documentElement.style.setProperty('--vp-w', `${width}px`);
  document.documentElement.style.height = `${height}px`;
  document.body.style.height = `${height}px`;
}

async function boot(): Promise<void> {
  try {
    let config = await fetchConfig();
    // Grid launchers replaced taskbar-pinned actions — clear legacy config ASAP.
    if (config.taskbarActions?.length) {
      config = await saveConfig({ ...config, taskbarActions: [] });
    }
    const platform = await fetchPlatform();
    applyTheme(config);

    const display = await fetchDisplay().catch(() => null);
    const kiosk =
      new URLSearchParams(window.location.search).get('kiosk') === 'true' ||
      display?.kiosk === true;
    if (kiosk) document.body.classList.add('kiosk-mode');
    const physical = getPhysicalDisplay(display);
    const browser = getBrowserViewport();
    syncBrowserViewport();

    window.addEventListener('resize', () => {
      syncBrowserViewport();
    });

    const taskbarEl = document.getElementById('taskbar');
    const slider = document.getElementById('workspace-slider');
    if (!taskbarEl || !slider) {
      throw new Error('Shell markup missing');
    }

    shellSSE.connect();

    const modals = new Modals();
    const taskbar = new Taskbar(taskbarEl, config);
    taskbar.bindStats();

    const handleCloseApp = (): void => {
      closeAppOverlay();
      taskbar.setAppContext(null);
    };

    const handleOpenApp = (component: ComponentInfo): void => {
      openAppOverlay(component, config, platform, handleCloseApp);
      taskbar.setAppContext(component.name, handleCloseApp);
    };

    const workspace = new Workspace(slider, modals, (enabled) => {
      taskbar.setEditActive(enabled);
    }, (active, total) => {
      taskbar.setPaneIndicator(active, total);
    }, handleOpenApp);

    const layout = await fetchLayout();
    await workspace.init(config, layout, platform, physical, browser);

    const components = await fetchComponents();
    taskbar.setComponents(components);

    taskbar.onEditToggle(() => workspace.toggleEditMode());
    taskbar.onAddWidget(() => {
      if (!workspace.isEditMode()) workspace.setEditMode(true);
      void fetchComponents().then((list) => {
        taskbar.setComponents(list);
        modals.openAddDrawer(list, {
          onWidget: (component) => void workspace.addGridItem(component),
          onApp: (component) => void workspace.addGridItem(component),
          onAction: (component) => void workspace.addGridItem(component),
        });
      });
    });
    taskbar.onPanePrev(() => workspace.prevPane());
    taskbar.onPaneNext(() => workspace.nextPane());
    taskbar.onAddPane(() => void workspace.addPane());
    taskbar.onSettings(() => {
      modals.openSettings(config, (next) => {
        Object.assign(config, next);
        taskbar.updateConfig(next);
        workspace.updateConfig(next);
      });
    });
    taskbar.onStore(() => {
      modals.openStore(() => {
        void fetchComponents().then((list) => {
          taskbar.setComponents(list);
          void workspace.refreshPlugins();
        });
      });
    });
    taskbar.onPower(() => modals.openPower(kiosk));

    document.body.dataset.shellReady = '1';
    document.body.dataset.shellLayout = 'grid-launchers-v2';
    document.body.dataset.coreVersion = platform.core_version;
    document.body.dataset.pluginApiVersion = String(platform.plugin_api_version);
    const tbH = taskbarHeight(config);
    const capacity = computeGridCapacity(physical.width, physical.height, tbH);
    document.body.dataset.gridCapacity = `${capacity.cols}x${capacity.rows}`;
    document.body.dataset.physicalDisplay = `${physical.width}x${physical.height}`;
    document.getElementById('boot-error')?.remove();
  } finally {
    document.body.classList.remove('booting');
  }
}

boot().catch((err) => {
  console.error(err);
  const banner = document.getElementById('boot-error');
  if (banner) {
    banner.removeAttribute('hidden');
    banner.textContent = `Boot failed: ${err instanceof Error ? err.message : String(err)}`;
  }
});
