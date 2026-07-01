import 'gridstack/dist/gridstack.min.css';
import './styles/shell.css';

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
import { openAppOverlay } from './app-overlay';
import {
  computeGridCapacity,
  getBrowserViewport,
  getPhysicalDisplay,
  taskbarHeight,
} from './geometry';
import { Modals } from './modals';
import { Taskbar } from './taskbar';
import { showToast } from './toast';
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
    const [config, platform] = await Promise.all([fetchConfig(), fetchPlatform()]);
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

    const workspace = new Workspace(slider, modals, (enabled) => {
      taskbar.setEditActive(enabled);
    }, (active, total) => {
      taskbar.setPaneIndicator(active, total);
    });

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
          onWidget: (component) => void workspace.addWidget(component),
          onApp: (component) => openAppOverlay(component, config, platform),
          onAction: (component) => {
            void (async () => {
              const current = config.taskbarActions ?? [];
              if (current.includes(component.id)) {
                showToast(`${component.name} is already on the taskbar`, 'info');
                return;
              }
              const next = { ...config, taskbarActions: [...current, component.id] };
              const saved = await saveConfig(next);
              Object.assign(config, saved);
              taskbar.updateConfig(saved);
              showToast(`${component.name} added to taskbar`, 'success');
            })();
          },
        });
      });
    });
    taskbar.onActionClick((componentId) => {
      const component = taskbar.getComponent(componentId);
      if (!component) return;
      const mode = component.action_mode === 'toggle' ? 'toggle' : 'momentary';
      void fetch(`/api/plugins/${component.plugin_id}/action/${component.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      })
        .then((res) => {
          if (!res.ok) throw new Error('Action failed');
          return res.json() as Promise<{ ok?: boolean; state?: string }>;
        })
        .then((body) => {
          const detail = body.state ? ` (${body.state})` : '';
          showToast(`${component.name}${detail}`, 'success');
        })
        .catch(() => showToast(`${component.name}: not wired yet`, 'info'));
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
