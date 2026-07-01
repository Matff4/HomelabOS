import type { WidgetSetting } from './types';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fieldValue(config: Record<string, unknown>, field: WidgetSetting): string | number | boolean {
  const current = config[field.key];
  if (current !== undefined && current !== null) return current as string | number | boolean;
  if (field.default !== undefined && field.default !== null) return field.default;
  if (field.type === 'boolean') return false;
  return '';
}

export function renderWidgetSettingsForm(
  settings: WidgetSetting[],
  config: Record<string, unknown>,
): string {
  return settings
    .map((field) => {
      const name = escapeHtml(field.key);
      const label = escapeHtml(field.label);
      const value = fieldValue(config, field);

      if (field.type === 'boolean') {
        const checked = value === true || value === 'true';
        return `<label class="setting-row setting-check">
          <input type="checkbox" name="${name}" ${checked ? 'checked' : ''} />
          <span>${label}</span>
        </label>`;
      }

      if (field.type === 'select' && field.options?.length) {
        const opts = field.options
          .map(
            (o) =>
              `<option value="${escapeHtml(o.value)}"${o.value === String(value) ? ' selected' : ''}>${escapeHtml(o.label)}</option>`,
          )
          .join('');
        return `<label class="setting-row">${label}
          <select name="${name}">${opts}</select>
        </label>`;
      }

      const inputType = field.type === 'number' ? 'number' : field.type === 'password' ? 'password' : 'text';
      return `<label class="setting-row">${label}
        <input class="setting-input" type="${inputType}" name="${name}" value="${escapeHtml(String(value))}" />
      </label>`;
    })
    .join('');
}

export function readWidgetSettingsForm(
  form: HTMLFormElement,
  settings: WidgetSetting[],
  existing: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...existing };
  const data = new FormData(form);

  for (const field of settings) {
    if (field.type === 'boolean') {
      next[field.key] = data.get(field.key) === 'on';
      continue;
    }
    const raw = data.get(field.key);
    if (raw === null) continue;
    const text = String(raw);
    if (field.type === 'number') {
      const num = Number(text);
      next[field.key] = Number.isFinite(num) ? num : text;
    } else {
      next[field.key] = text;
    }
  }

  return next;
}
