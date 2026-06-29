/** Frozen HomelabOS plugin SDK types — Phase 0 contract. */

export const SDK_VERSION = '1.0.0';
export const PLUGIN_API_VERSION = 1;

export type Theme = 'dark' | 'light';

export interface HomelabOSPlatform {
  kiosk: boolean;
  theme: Theme;
  accent: string;
}

export type Unsubscribe = () => void;

export interface HomelabOSStatic {
  readonly version: string;
  readonly platform: HomelabOSPlatform;
  fetch(url: string, opts?: RequestInit): Promise<Response>;
  subscribe(channel: string, callback: (data: unknown) => void): Unsubscribe;
  getConfig(): Record<string, unknown>;
  saveConfig(config: Record<string, unknown>): Promise<void>;
}

export type PostMessageType =
  | 'PLUGIN_READY'
  | 'OS_THEME_UPDATE'
  | 'WIDGET_CONFIG'
  | 'WIDGET_CONFIG_UPDATE'
  | 'SAVE_WIDGET_CONFIG'
  | 'SSE_RELAY';

export interface SSERelayPayload {
  channel: string;
  data: Record<string, unknown>;
  ts?: string;
}
