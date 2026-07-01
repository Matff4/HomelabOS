/** Material Symbols Rounded icon names used in the shell UI. */
export const icons = {
  cpu: 'memory',
  ram: 'memory_alt',
  add: 'add_circle',
  addPane: 'post_add',
  chevronLeft: 'chevron_left',
  chevronRight: 'chevron_right',
  edit: 'edit',
  settings: 'settings',
  power: 'power_settings_new',
  close: 'close',
  store: 'storefront',
  widget: 'widgets',
} as const;

export function icon(name: string, label?: string): string {
  const aria = label ? ` aria-hidden="true"` : ' aria-hidden="true"';
  return `<span class="material-symbols-rounded"${aria}>${name}</span>`;
}
