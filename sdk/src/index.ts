/**
 * HomelabOS Plugin SDK — iframe widgets (SSE relay via shell postMessage).
 * Built as IIFE; sets window.HomelabOS (do not use esbuild --global-name).
 */
import type {
  HomelabOSPlatform,
  HomelabOSStatic,
  PostMessageType,
  SSERelayPayload,
  Unsubscribe,
} from './types';
import { SDK_VERSION } from './types';

const ACCENT_MAP: Record<string, string> = {
  blue: '#89b4fa',
  green: '#a6e3a1',
  purple: '#cba6f7',
  red: '#f38ba8',
  orange: '#fab387',
  yellow: '#f9e2af',
};

const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;

function resolveAccent(raw: string | null): string {
  if (!raw) return ACCENT_MAP.blue;
  if (raw.startsWith('#')) return raw;
  return ACCENT_MAP[raw] ?? ACCENT_MAP.blue;
}

const defaultPlatform: HomelabOSPlatform = {
  kiosk: params?.get('kiosk') === 'true',
  theme: params?.get('theme') === 'light' ? 'light' : 'dark',
  accent: resolveAccent(params?.get('accent')),
  coreVersion: params?.get('coreVersion') ?? 'unknown',
  pluginApiVersion: Number.parseInt(params?.get('pluginApiVersion') ?? '1', 10) || 1,
  sdkVersion: params?.get('sdkVersion') ?? SDK_VERSION,
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
      document.documentElement.style.setProperty(
        '--accent',
        message.accent || defaultPlatform.accent,
      );
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

function createHomelabOS(): HomelabOSStatic {
  return {
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

    closeApp(): void {
      if (typeof window !== 'undefined' && window.parent !== window) {
        window.parent.postMessage({ type: 'CLOSE_APP' }, '*');
      }
    },
  };
}

function sendReady(): void {
  if (typeof window === 'undefined' || window.parent === window) return;
  const height = document.body?.scrollHeight ?? document.documentElement?.scrollHeight ?? 100;
  window.parent.postMessage({ type: 'PLUGIN_READY', height }, '*');
}

function initIframeBridge(): void {
  if (typeof window === 'undefined' || window.parent === window) return;
  window.addEventListener('message', handleParentMessage);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', sendReady);
  } else {
    sendReady();
  }
}

declare global {
  interface Window {
    HomelabOS: HomelabOSStatic;
  }
}

if (typeof window !== 'undefined') {
  window.HomelabOS = createHomelabOS();
  initIframeBridge();
}
