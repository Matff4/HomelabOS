import type { ComponentInfo, DisplayInfo, LayoutItem, PlatformInfo, SSEMessage, SystemConfig } from './types';
import type { MarketplaceCatalog, PluginActionResult, PluginSummary } from './store-types';

const ACCENT: Record<string, string> = {
  blue: '#89b4fa',
  green: '#a6e3a1',
  purple: '#cba6f7',
  red: '#f38ba8',
  orange: '#fab387',
  yellow: '#f9e2af',
};

export async function fetchConfig(): Promise<SystemConfig> {
  const res = await fetch('/api/config');
  if (!res.ok) throw new Error('Failed to load config');
  return res.json();
}

export async function fetchLayout(): Promise<LayoutItem[]> {
  const res = await fetch('/api/layout');
  if (!res.ok) throw new Error('Failed to load layout');
  return res.json();
}

export async function saveLayout(layout: LayoutItem[]): Promise<void> {
  const res = await fetch('/api/layout', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(layout),
  });
  if (!res.ok) throw new Error('Failed to save layout');
}

export async function fetchPlugins(): Promise<PluginSummary[]> {
  const res = await fetch('/api/plugins');
  if (!res.ok) throw new Error('Failed to load plugins');
  return res.json();
}

export async function fetchMarketplaceCatalog(): Promise<MarketplaceCatalog> {
  const res = await fetch('/api/marketplace/catalog');
  if (!res.ok) throw new Error('Failed to load plugin store catalog');
  return res.json();
}

export async function installPlugin(url: string): Promise<PluginActionResult> {
  const res = await fetch('/api/plugins/install', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(body?.detail ?? 'Install failed');
  }
  return res.json();
}

export async function updatePlugin(id: string, url: string): Promise<PluginActionResult> {
  const res = await fetch(`/api/plugins/${encodeURIComponent(id)}/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(body?.detail ?? 'Update failed');
  }
  return res.json();
}

export async function deletePlugin(id: string): Promise<PluginActionResult> {
  const res = await fetch(`/api/plugins/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(body?.detail ?? 'Remove failed');
  }
  return res.json();
}

export async function fetchPlatform(): Promise<PlatformInfo> {
  const res = await fetch('/api/platform');
  if (!res.ok) throw new Error('Failed to load platform info');
  return res.json();
}

export async function fetchComponents(): Promise<ComponentInfo[]> {
  const res = await fetch('/api/components');
  if (!res.ok) throw new Error('Failed to load components');
  return res.json();
}

export async function fetchDisplay(): Promise<DisplayInfo> {
  const res = await fetch('/api/system/display');
  if (!res.ok) throw new Error('Failed to load display info');
  return res.json();
}

export async function saveConfig(config: SystemConfig): Promise<SystemConfig> {
  const res = await fetch('/api/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error('Failed to save config');
  return res.json();
}

export function accentColor(config: SystemConfig): string {
  return ACCENT[config.accentColor] ?? ACCENT.blue;
}

export function applyTheme(config: SystemConfig): void {
  document.body.classList.remove('theme-light', 'theme-dark');
  document.body.classList.add(config.theme === 'light' ? 'theme-light' : 'theme-dark');
  document.body.classList.remove('bar-small', 'bar-medium', 'bar-big');
  document.body.classList.add(`bar-${config.barHeight || 'medium'}`);
  document.body.classList.remove('widget-bar-small', 'widget-bar-medium', 'widget-bar-big');
  document.body.classList.add(`widget-bar-${config.widgetBarHeight || 'medium'}`);
  document.documentElement.style.setProperty('--accent', accentColor(config));
}

export async function patchWidgetConfig(
  instanceId: string,
  config: Record<string, unknown>,
): Promise<LayoutItem> {
  const res = await fetch('/api/layout/widget', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instance_id: instanceId, config }),
  });
  if (!res.ok) throw new Error('Failed to save widget config');
  return res.json();
}

export type SSEHandler = (message: SSEMessage) => void;

export class ShellSSE {
  private source: EventSource | null = null;
  private handlers = new Set<SSEHandler>();
  private relayTargets = new Set<HTMLIFrameElement>();
  private connected = false;

  onMessage(handler: SSEHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  registerIframe(iframe: HTMLIFrameElement): void {
    this.relayTargets.add(iframe);
  }

  unregisterIframe(iframe: HTMLIFrameElement): void {
    this.relayTargets.delete(iframe);
  }

  isConnected(): boolean {
    return this.connected;
  }

  connect(): void {
    if (this.source) return;
    this.source = new EventSource('/api/events');
    this.source.onopen = () => {
      this.connected = true;
      document.dispatchEvent(new CustomEvent('homelabos:sse-status'));
    };
    this.source.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as SSEMessage;
        this.handlers.forEach((handler) => handler(message));
        this.relayTargets.forEach((iframe) => {
          iframe.contentWindow?.postMessage({ type: 'SSE_RELAY', ...message }, '*');
        });
      } catch (err) {
        console.error('SSE parse error', err);
      }
    };
    this.source.onerror = () => {
      this.connected = false;
      document.dispatchEvent(new CustomEvent('homelabos:sse-status'));
      this.source?.close();
      this.source = null;
      window.setTimeout(() => this.connect(), 3000);
    };
  }
}

export async function softResetDashboard(): Promise<{ message: string }> {
  const res = await fetch('/api/system/soft-reset', { method: 'POST' });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(body?.detail ?? 'Reset failed');
  }
  return res.json();
}

export async function clearBrowserCaches(): Promise<void> {
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    /* kiosk may block storage */
  }
}
