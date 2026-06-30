import type { SystemConfig, SystemStats } from './types';

const BAR_HEIGHT: Record<string, number> = { small: 36, medium: 48, big: 64 };
export const GRID_COLS = 12;
export const GRID_ROWS = 2;

export function taskbarHeight(config: SystemConfig): number {
  return BAR_HEIGHT[config.barHeight] ?? 48;
}

export function calculateGridGeometry(config: SystemConfig) {
  const tbHeight = taskbarHeight(config);
  const screenH = window.innerHeight || 280;
  const screenW = window.innerWidth || 1424;
  const availableH = screenH - tbHeight;
  const gap = 5;
  const containerW = screenW - gap * 2;
  const maxCellH = Math.floor((availableH - gap * (GRID_ROWS + 1)) / GRID_ROWS);
  const maxCellW = Math.floor((containerW - gap * (GRID_COLS + 1)) / GRID_COLS);
  const cellH = Math.max(20, Math.min(maxCellH, maxCellW));
  return { cellH, gap, containerW, tbHeight };
}

export function widgetQuery(config: SystemConfig, instanceId: string): string {
  const params = new URLSearchParams({
    kiosk: 'true',
    theme: config.theme,
    accent: config.accentColor,
    instance: instanceId,
  });
  return params.toString();
}

export function formatStats(stats: SystemStats, config: SystemConfig): { cpu: string; ram: string } {
  const cpu = `${stats.cpu_percent.toFixed(1).padStart(4, ' ')}%`;
  let ram: string;
  if (config.ramFormat === 'absolute') {
    const used = (stats.mem_used_mb / 1024).toFixed(1);
    const total = (stats.mem_total_mb / 1024).toFixed(1);
    ram = `${used} / ${total} GB`;
  } else {
    ram = `${stats.mem_percent.toFixed(1).padStart(4, ' ')}%`;
  }
  return { cpu, ram };
}

export function formatClock(config: SystemConfig): string {
  const opts: Intl.DateTimeFormatOptions =
    config.timeFormat === '12'
      ? { hour: 'numeric', minute: '2-digit', hour12: true }
      : { hour: '2-digit', minute: '2-digit', hour12: false };
  return new Date().toLocaleTimeString([], opts);
}
