/**
 * HomelabOS Plugin SDK — iframe widgets (SSE relay via shell postMessage).
 */
import {
  HomelabOSPlatform,
  HomelabOSStatic,
  PostMessageType,
  SDK_VERSION,
  SSERelayPayload,
  Unsubscribe,
} from './types';

export * from './types';

const ACCENT_MAP: Record<string, string> = {
  blue: '#89b4fa',
  green: '#a6e3a1',
  purple: '#cba6f7',
  red: '#f38ba8',
  orange: '#fab387',
  yellow: '#f9e2af',
};

const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;

const defaultPlatform: HomelabOSPlatform = {
  kiosk: params?.get('kiosk') === 'true',
  theme: params?.get('theme') === 'light' ? 'light' : 'dark',
  accent: params?.get('accent') || ACCENT_MAP.blue,
};

let instanceId: string | null = params?.get('instance') || null;
let widgetConfig: Record<string, unknown> = {};

const subscriptions = new Map<string, Set<(data: unknown) => void>>();

function dispatch(channel: string, data: unknown): void {
  subscriptions.get(channel)?.forEach((callback) => callback(data));
}

function handleParentMessage(event: MessageEvent): void {
  const message = event.data;
  if (!message || typeof message !== 'object') return;

  switch (message.type as PostMessageType) {
    case 'SSE_RELAY': {
      const payload = message as SSERelayPayload & { type: 'SSE_RELAY' };
      dispatch(payload.channel, payload.data);
      break;
    }
    case 'OS_THEME_UPDATE':
      document.documentElement.style.setProperty('--accent', message.accent || defaultPlatform.accent);
      document.documentElement.style.colorScheme = message.theme || defaultPlatform.theme;
      break;
    case 'WIDGET_CONFIG':
      instanceId = message.instanceId ?? instanceId;
      widgetConfig = message.config ?? {};
      break;
    case 'WIDGET_CONFIG_UPDATE':
      widgetConfig = message.config ?? widgetConfig;
      break;
    default:
      break;
  }
}

if (typeof window !== 'undefined' && window.parent !== window) {
  window.addEventListener('message', handleParentMessage);
  window.parent.postMessage({ type: 'PLUGIN_READY', height: document.body.scrollHeight || 100 }, '*');
}

export const HomelabOS: HomelabOSStatic = {
  version: SDK_VERSION,
  platform: defaultPlatform,

  fetch(url: string, opts?: RequestInit): Promise<Response> {
    return fetch(url, opts);
  },

  subscribe(channel: string, callback: (data: unknown) => void): Unsubscribe {
    if (!subscriptions.has(channel)) subscriptions.set(channel, new Set());
    subscriptions.get(channel)!.add(callback);
    return () => subscriptions.get(channel)?.delete(callback);
  },

  getConfig(): Record<string, unknown> {
    return { ...widgetConfig };
  },

  async saveConfig(config: Record<string, unknown>): Promise<void> {
    widgetConfig = { ...config };
    if (typeof window !== 'undefined' && window.parent !== window) {
      window.parent.postMessage(
        { type: 'SAVE_WIDGET_CONFIG', instanceId, config: widgetConfig },
        '*',
      );
    }
  },
};

declare global {
  interface Window {
    HomelabOS: HomelabOSStatic;
  }
}

if (typeof window !== 'undefined') {
  window.HomelabOS = HomelabOS;
}
