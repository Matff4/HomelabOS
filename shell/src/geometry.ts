import type { DisplayInfo, LayoutItem, SystemConfig, SystemStats } from './types';

const BAR_HEIGHT: Record<string, number> = { small: 36, medium: 48, big: 64 };

/** Minimum readable widget row height on the physical panel (px). */
const MIN_CELL_H = 72;
/** Layout x/w are stored in these column units. */
const DEFAULT_COLS = 12;
const GRID_GAP = 6;
const WORKSPACE_PAD = 8;

export interface GridCapacity {
  cols: number;
  rows: number;
}

export interface GridSpec extends GridCapacity {
  cellH: number;
  gap: number;
  workspaceW: number;
  workspaceH: number;
  taskbarH: number;
}

export function taskbarHeight(config: SystemConfig): number {
  return BAR_HEIGHT[config.barHeight] ?? 48;
}

/** Physical panel resolution from the Pi API (authoritative for grid capacity). */
export function getPhysicalDisplay(display: DisplayInfo | null): { width: number; height: number } {
  if (display && display.width > 0 && display.height > 0) {
    return { width: display.width, height: display.height };
  }
  // API unreachable — fall back so the shell still boots locally
  return getBrowserViewport();
}

/** Browser viewport — used for page layout and scaled tile pixel size. */
export function getBrowserViewport(): { width: number; height: number } {
  return {
    width: Math.max(window.innerWidth || 0, 320),
    height: Math.max(window.innerHeight || 0, 240),
  };
}

/**
 * Row/column count from the connected physical display only.
 * Same result whether you open the shell on the Pi or from a PC browser.
 */
export function computeGridCapacity(
  physicalW: number,
  physicalH: number,
  taskbarH: number,
): GridCapacity {
  const workspaceW = Math.max(physicalW - WORKSPACE_PAD * 2, 320);
  const workspaceH = Math.max(physicalH - taskbarH - WORKSPACE_PAD * 2, MIN_CELL_H);

  const cols = DEFAULT_COLS;

  const maxRows = Math.max(
    1,
    Math.floor((workspaceH + GRID_GAP) / (MIN_CELL_H + GRID_GAP)),
  );

  const cellW = (workspaceW - GRID_GAP * (cols + 1)) / cols;
  let refCellH = (workspaceH - GRID_GAP * (maxRows + 1)) / maxRows;
  refCellH = Math.max(MIN_CELL_H, Math.min(refCellH, cellW));

  const rows = Math.max(
    1,
    Math.floor((workspaceH + GRID_GAP) / (refCellH + GRID_GAP)),
  );

  return { cols, rows };
}

/**
 * Full grid spec: capacity from physical display, cell pixel height from render viewport.
 */
export function computeGridSpec(
  capacity: GridCapacity,
  renderW: number,
  renderH: number,
  taskbarH: number,
): GridSpec {
  const workspaceW = Math.max(renderW - WORKSPACE_PAD * 2, 320);
  const workspaceH = Math.max(renderH - taskbarH - WORKSPACE_PAD * 2, capacity.rows);

  const cellH = Math.max(
    1,
    Math.floor((workspaceH - GRID_GAP * (capacity.rows + 1)) / capacity.rows),
  );

  return {
    cols: capacity.cols,
    rows: capacity.rows,
    cellH,
    gap: GRID_GAP,
    workspaceW,
    workspaceH,
    taskbarH,
  };
}

export function gridCapacityKey(capacity: GridCapacity): string {
  return `${capacity.cols}x${capacity.rows}`;
}

/** Clamp saved layout items to current grid capacity (positions preserved when possible). */
export function clampLayoutItem(item: LayoutItem, spec: GridCapacity): LayoutItem {
  const w = Math.max(1, Math.min(item.w, spec.cols));
  const x = Math.max(0, Math.min(item.x, spec.cols - w));
  const h = Math.max(1, Math.min(item.h, spec.rows));
  const y = Math.max(0, Math.min(item.y, spec.rows - h));
  return { ...item, x, y, w, h };
}

export function applyGridSpecToDocument(spec: GridSpec): void {
  document.documentElement.style.setProperty('--grid-cols', String(spec.cols));
  document.documentElement.style.setProperty('--grid-rows', String(spec.rows));
  document.documentElement.style.setProperty('--grid-cell-h', `${spec.cellH}px`);
  document.documentElement.style.setProperty('--grid-gap', `${spec.gap}px`);
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
