export interface SystemConfig {
  timeFormat: '12' | '24';
  ramFormat: 'percent' | 'absolute';
  theme: 'dark' | 'light';
  barHeight: 'small' | 'medium' | 'big';
  widgetBarHeight: 'small' | 'medium' | 'big';
  accentColor: 'blue' | 'green' | 'purple' | 'red' | 'orange' | 'yellow';
  marketplaceUrl?: string | null;
  paneCount?: number;
}

export interface PlatformInfo {
  core_version: string;
  plugin_api_version: number;
  sdk_version: string;
  supported_manifest_api_versions: number[];
}

export interface SystemStats {
  cpu_percent: number;
  mem_used_mb: number;
  mem_total_mb: number;
  mem_percent: number;
  uptime_seconds: number;
}

export interface DisplayInfo {
  width: number;
  height: number;
  kiosk: boolean;
}

export interface LayoutItem {
  instance_id: string;
  component_id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  pane: number;
  config: Record<string, unknown>;
}

export type WidgetSettingType = 'text' | 'number' | 'boolean' | 'select' | 'password';

export interface WidgetSettingOption {
  label: string;
  value: string;
}

export interface WidgetSetting {
  key: string;
  label: string;
  type: WidgetSettingType;
  default?: string | number | boolean | null;
  options?: WidgetSettingOption[] | null;
}

export interface ComponentInfo {
  id: string;
  plugin_id: string;
  type: 'widget' | 'app' | 'action';
  name: string;
  icon?: string | null;
  entry_url: string;
  size?: { w: number; h: number } | null;
  min_size?: { w: number; h: number } | null;
  settings?: WidgetSetting[] | null;
  action_mode?: 'toggle' | 'momentary' | null;
}

export interface SSEMessage {
  channel: string;
  data: Record<string, unknown>;
  ts?: string;
}
