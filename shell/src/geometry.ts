import type { DisplayInfo, LayoutItem, SystemConfig, SystemStats } from './types';

const BAR_HEIGHT: Record<string, number> = { small: 36, medium: 48, big: 64 };

/** Square 1×1 tile size bounds (px). */
export const MIN_CELL = 90;
export const MAX_CELL = 130;
const MIN_COLS = 4;
const MAX_COLS = 24;
const GRID_GAP = 10;
const WORKSPACE_PAD = 10;

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
  gridPixelW: number;
  gridPixelH: number;
}

export function taskbarHeight(config: SystemConfig): number {
  return BAR_HEIGHT[config.barHeight] ?? 48;
}

export function getPhysicalDisplay(display: DisplayInfo | null): { width: number; height: number } {
  if (display && display.width > 0 && display.height > 0) {
    return { width: display.width, height: display.height };
  }
  return getBrowserViewport();
}

export function getBrowserViewport(): { width: number; height: number } {
  return {
    width: Math.max(window.innerWidth || 0, 320),
    height: Math.max(window.innerHeight || 0, 240),
  };
}

function workspaceDims(
  viewportW: number,
  viewportH: number,
  taskbarH: number,
): { workspaceW: number; workspaceH: number } {
  return {
    workspaceW: Math.max(viewportW - WORKSPACE_PAD * 2, MIN_CELL * MIN_COLS),
    workspaceH: Math.max(viewportH - taskbarH - WORKSPACE_PAD * 2, MIN_CELL),
  };
}

function cellFromCols(workspaceW: number, cols: number): number {
  return (workspaceW - GRID_GAP * (cols + 1)) / cols;
}

function rowsThatFit(workspaceH: number, cell: number): number {
  return Math.max(1, Math.floor((workspaceH - GRID_GAP) / (cell + GRID_GAP)));
}

function gridHeight(rows: number, cell: number): number {
  return rows * cell + GRID_GAP * (rows + 1);
}

function gridWidth(cols: number, cell: number): number {
  return cols * cell + GRID_GAP * (cols + 1);
}

/**
 * Physical panel → grid capacity. Square tiles in [MIN_CELL, MAX_CELL]; prefer denser grids.
 */
export function computeGridCapacity(
  physicalW: number,
  physicalH: number,
  taskbarH: number,
): GridCapacity {
  const { workspaceW, workspaceH } = workspaceDims(physicalW, physicalH, taskbarH);

  let best: GridCapacity = { cols: 12, rows: 1 };
  let bestDensity = 0;

  for (let cols = MAX_COLS; cols >= MIN_COLS; cols--) {
    const cellRaw = cellFromCols(workspaceW, cols);
    if (cellRaw > MAX_CELL || cellRaw < MIN_CELL) continue;

    const cell = Math.floor(cellRaw);
    const rows = rowsThatFit(workspaceH, cell);
    if (gridHeight(rows, cell) > workspaceH + 0.5) continue;

    const density = cols * rows;
    if (density > bestDensity) {
      bestDensity = density;
      best = { cols, rows };
    }
  }

  if (bestDensity > 0) return best;

  // Fallback: closest valid square size, then derive cols/rows
  let cols = 12;
  let cell = Math.floor(cellFromCols(workspaceW, cols));
  cell = Math.max(MIN_CELL, Math.min(MAX_CELL, cell));

  if (cell > MAX_CELL) {
    while (cols < MAX_COLS && cell > MAX_CELL) {
      cols += 1;
      cell = Math.floor(cellFromCols(workspaceW, cols));
    }
  } else if (cell < MIN_CELL) {
    while (cols > MIN_COLS && cell < MIN_CELL) {
      cols -= 1;
      cell = Math.floor(cellFromCols(workspaceW, cols));
    }
  }

  cell = Math.max(MIN_CELL, Math.min(MAX_CELL, cell));
  return { cols, rows: rowsThatFit(workspaceH, cell) };
}

/**
 * Render viewport → square cell pixel size (same cols/rows as physical capacity).
 */
export function computeGridSpec(
  capacity: GridCapacity,
  renderW: number,
  renderH: number,
  taskbarH: number,
): GridSpec {
  const { workspaceW, workspaceH } = workspaceDims(renderW, renderH, taskbarH);

  const fromW = cellFromCols(workspaceW, capacity.cols);
  const fromH = (workspaceH - GRID_GAP * (capacity.rows + 1)) / capacity.rows;
  let cell = Math.floor(Math.min(fromW, fromH));
  cell = Math.max(MIN_CELL, Math.min(MAX_CELL, cell));

  return {
    cols: capacity.cols,
    rows: capacity.rows,
    cellH: cell,
    gap: GRID_GAP,
    workspaceW,
    workspaceH,
    taskbarH,
    gridPixelW: gridWidth(capacity.cols, cell),
    gridPixelH: gridHeight(capacity.rows, cell),
  };
}

export function gridCapacityKey(capacity: GridCapacity): string {
  return `${capacity.cols}x${capacity.rows}`;
}

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
  document.documentElement.style.setProperty('--grid-pixel-w', `${spec.gridPixelW}px`);
  document.documentElement.style.setProperty('--grid-pixel-h', `${spec.gridPixelH}px`);
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
