import type { DisplayInfo, LayoutItem, SystemConfig, SystemStats } from './types';

const BAR_HEIGHT: Record<string, number> = { small: 36, medium: 48, big: 64 };

/** Square 1×1 tile size bounds (px). */
export const MIN_CELL = 90;
export const MAX_CELL = 130;
const MIN_COLS = 4;
const MAX_COLS = 16;
/** Gap between grid cells (GridStack margin). */
export const GRID_GAP = 10;
const WORKSPACE_PAD = 8;
const STAGE_PAD = GRID_GAP;

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

export function workspaceDims(
  viewportW: number,
  viewportH: number,
  taskbarH: number,
): { workspaceW: number; workspaceH: number } {
  const inset = WORKSPACE_PAD * 2 + STAGE_PAD * 2;
  return {
    workspaceW: Math.max(viewportW - inset, MIN_CELL * MIN_COLS),
    workspaceH: Math.max(viewportH - taskbarH - inset, MIN_CELL),
  };
}

export function gridWidth(cols: number, cell: number, gap = GRID_GAP): number {
  return cols * cell + gap * (cols + 1);
}

export function gridHeight(rows: number, cell: number, gap = GRID_GAP): number {
  return rows * cell + gap * (rows + 1);
}

function rowsThatFit(workspaceH: number, cell: number, gap = GRID_GAP): number {
  return Math.max(1, Math.floor((workspaceH + gap) / (cell + gap)));
}

/** Max columns that can fit at MIN_CELL on this workspace width. */
export function maxColsForWorkspace(workspaceW: number): number {
  const limit = Math.floor((workspaceW + GRID_GAP) / (MIN_CELL + GRID_GAP));
  return Math.max(MIN_COLS, Math.min(MAX_COLS, limit));
}

/**
 * Largest integer square cell for cols×rows, or null if nothing fits in [MIN_CELL, MAX_CELL].
 * Never clamps up — invalid geometry must be rejected by the caller.
 */
export function fitSquareCell(
  workspaceW: number,
  workspaceH: number,
  cols: number,
  rows: number,
): number | null {
  const maxFromW = (workspaceW - GRID_GAP * (cols + 1)) / cols;
  const maxFromH = (workspaceH - GRID_GAP * (rows + 1)) / rows;
  let cell = Math.floor(Math.min(maxFromW, maxFromH));

  if (cell > MAX_CELL) cell = MAX_CELL;
  if (cell < MIN_CELL) return null;

  while (cell >= MIN_CELL && gridWidth(cols, cell) > workspaceW + 0.5) cell -= 1;
  while (cell >= MIN_CELL && gridHeight(rows, cell) > workspaceH + 0.5) cell -= 1;

  return cell >= MIN_CELL ? cell : null;
}

/** Physical panel → grid capacity (prefer denser valid layouts). */
export function computeGridCapacity(
  physicalW: number,
  physicalH: number,
  taskbarH: number,
): GridCapacity {
  const { workspaceW, workspaceH } = workspaceDims(physicalW, physicalH, taskbarH);
  const colLimit = maxColsForWorkspace(workspaceW);

  let best: GridCapacity = { cols: Math.min(12, colLimit), rows: 1 };
  let bestDensity = 0;

  for (let cols = colLimit; cols >= MIN_COLS; cols--) {
    let rows = rowsThatFit(workspaceH, MIN_CELL);
    while (rows >= 1) {
      const cell = fitSquareCell(workspaceW, workspaceH, cols, rows);
      if (cell !== null) {
        const density = cols * rows;
        if (density > bestDensity) {
          bestDensity = density;
          best = { cols, rows };
        }
        break;
      }
      rows -= 1;
    }
  }

  if (bestDensity > 0) return best;

  const cols = Math.min(12, colLimit);
  const rows = Math.max(1, rowsThatFit(workspaceH, MIN_CELL));
  return { cols, rows };
}

/** Render viewport → cell size (cols/rows from physical capacity). */
export function computeGridSpec(
  capacity: GridCapacity,
  renderW: number,
  renderH: number,
  taskbarH: number,
): GridSpec {
  const { workspaceW, workspaceH } = workspaceDims(renderW, renderH, taskbarH);
  const cell =
    fitSquareCell(workspaceW, workspaceH, capacity.cols, capacity.rows) ??
    fitSquareCell(workspaceW, workspaceH, capacity.cols, 1) ??
    MIN_CELL;

  return {
    cols: capacity.cols,
    rows: capacity.rows,
    cellH: cell,
    gap: GRID_GAP,
    workspaceW,
    workspaceH,
    taskbarH,
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
  document.documentElement.style.setProperty('--grid-workspace-w', `${spec.workspaceW}px`);
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
