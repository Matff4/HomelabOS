import './styles/shell.css';

import { applyTheme, ensureDemoLayout, fetchConfig, shellSSE } from './api';
import { Taskbar } from './taskbar';
import { Workspace } from './workspace';

function syncViewport(): void {
  const h = Math.max(window.innerHeight || 0, 280);
  const w = Math.max(window.innerWidth || 0, 400);
  document.documentElement.style.setProperty('--vp-h', `${h}px`);
  document.documentElement.style.setProperty('--vp-w', `${w}px`);
}

async function boot(): Promise<void> {
  try {
    syncViewport();
    window.addEventListener('resize', syncViewport);

    const config = await fetchConfig();
    applyTheme(config);

    const taskbarEl = document.getElementById('taskbar');
    const viewport = document.getElementById('workspace-viewport');
    const slider = document.getElementById('workspace-slider');
    if (!taskbarEl || !viewport || !slider) {
      throw new Error('Shell markup missing');
    }

    shellSSE.connect();

    const taskbar = new Taskbar(taskbarEl, config);
    taskbar.bindStats();

    const workspace = new Workspace(viewport, slider, (enabled) => {
      taskbar.setEditActive(enabled);
    });

    const components = await fetch('/api/components').then((r) => r.json());
    const layout = await ensureDemoLayout(components);
    await workspace.init(config, layout);

    taskbar.onEditToggle(() => workspace.toggleEditMode());
    taskbar.onAddWidget(() => {
      if (!workspace.isEditMode()) workspace.setEditMode(true);
      void workspace.addDemoWidget();
    });

    document.body.dataset.shellReady = '1';
  } finally {
    document.body.classList.remove('booting');
  }
}

boot().catch((err) => {
  console.error(err);
  const banner = document.getElementById('boot-error');
  if (banner) {
    banner.hidden = false;
    banner.textContent = `Boot failed: ${err instanceof Error ? err.message : String(err)}`;
  }
});
