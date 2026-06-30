/** Title-case for UI labels (form values stay lowercase slugs). */
export function titleCase(value: string): string {
  switch (value) {
    case '24':
      return '24-Hour';
    case '12':
      return '12-Hour';
    case 'percent':
      return 'Percent';
    case 'absolute':
      return 'Absolute';
    default:
      return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
  }
}

export function selectOptions(values: readonly string[], selected: string): string {
  return values
    .map(
      (v) => `<option value="${v}"${v === selected ? ' selected' : ''}>${titleCase(v)}</option>`,
    )
    .join('');
}
