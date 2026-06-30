export interface SystemConfig {
  timeFormat: '12' | '24';
  ramFormat: 'percent' | 'absolute';
  theme: 'dark' | 'light';
  barHeight: 'small' | 'medium' | 'big';
  widgetBarHeight: 'small' | 'medium' | 'big';
  accentColor: 'blue' | 'green' | 'purple' | 'red' | 'orange' | 'yellow';
  marketplaceUrl?: string | null;
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

export interface ComponentInfo {
  id: string;
  plugin_id: string;
  type: 'widget' | 'app' | 'action';
  name: string;
  icon?: string | null;
  entry_url: string;
  size?: { w: number; h: number } | null;
  min_size?: { w: number; h: number } | null;
}

export interface SSEMessage {
  channel: string;
  data: Record<string, unknown>;
  ts?: string;
}
