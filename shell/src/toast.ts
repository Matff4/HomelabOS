export type ToastVariant = 'success' | 'error' | 'info';

const DEFAULT_MS = 4500;

function root(): HTMLElement {
  let el = document.getElementById('toast-root');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast-root';
    el.className = 'toast-root';
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  return el;
}

export function showToast(message: string, variant: ToastVariant = 'info', durationMs = DEFAULT_MS): void {
  const item = document.createElement('div');
  item.className = `toast toast-${variant}`;
  item.textContent = message;
  root().appendChild(item);

  requestAnimationFrame(() => item.classList.add('toast-visible'));

  const remove = (): void => {
    item.classList.remove('toast-visible');
    window.setTimeout(() => item.remove(), 280);
  };

  const timer = window.setTimeout(remove, durationMs);
  item.addEventListener('click', () => {
    window.clearTimeout(timer);
    remove();
  });
}
