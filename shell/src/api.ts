import type { ComponentInfo, DisplayInfo, LayoutItem, SSEMessage, SystemConfig } from './types';
import type { GridCapacity } from './geometry';

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
  document.documentElement.style.setProperty('--accent', accentColor(config));
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

export const shellSSE = new ShellSSE();

export async function ensureDemoLayout(
  components: ComponentInfo[],
  capacity: GridCapacity,
): Promise<LayoutItem[]> {
  const layout = await fetchLayout();
  if (layout.length > 0) return layout;

  const demo = components.find((c) => c.id === 'demo_widget');
  if (!demo) return layout;

  const size = demo.size ?? { w: 3, h: 1 };
  const seeded: LayoutItem = {
    instance_id: `inst_${Date.now()}`,
    component_id: demo.id,
    x: 0,
    y: 0,
    w: Math.min(size.w, capacity.cols),
    h: Math.min(size.h, capacity.rows),
    pane: 0,
    config: { title: 'HomelabOS' },
  };
  await saveLayout([seeded]);
  return [seeded];
}
