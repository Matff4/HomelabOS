import type { ComponentInfo, PlatformInfo, SystemConfig } from './types';
import { accentColor, shellSSE } from './api';
import { widgetQuery } from './geometry';
import { icon, icons } from './icons';

let overlayEl: HTMLElement | null = null;
let messageHandler: ((event: MessageEvent) => void) | null = null;

export function openAppOverlay(
  component: ComponentInfo,
  config: SystemConfig,
  platform: PlatformInfo,
): void {
  closeAppOverlay();

  const instanceId = `app_${Date.now()}`;
  const src = `${component.entry_url}?${widgetQuery(config, instanceId, platform)}`;

  overlayEl = document.createElement('div');
  overlayEl.className = 'app-overlay';
  overlayEl.innerHTML = `
    <header class="app-overlay-bar">
      <button type="button" class="taskbar-btn app-overlay-close" title="Close">
        ${icon(icons.close)}
      </button>
      <span class="app-overlay-title">${component.name}</span>
    </header>
    <iframe class="app-overlay-frame" src="${src}" title="${component.name}"></iframe>
  `;

  document.body.appendChild(overlayEl);
  document.body.classList.add('app-open');

  const iframe = overlayEl.querySelector('iframe') as HTMLIFrameElement;

  overlayEl.querySelector('.app-overlay-close')?.addEventListener('click', closeAppOverlay);

  iframe.addEventListener('load', () => {
    shellSSE.registerIframe(iframe);
    iframe.contentWindow?.postMessage(
      {
        type: 'OS_THEME_UPDATE',
        theme: config.theme,
        accent: accentColor(config),
      },
      '*',
    );
  });

  if (!messageHandler) {
    messageHandler = (event: MessageEvent) => {
      if (event.data?.type === 'CLOSE_APP') closeAppOverlay();
    };
    window.addEventListener('message', messageHandler);
  }
}

export function closeAppOverlay(): void {
  const iframe = overlayEl?.querySelector('iframe') as HTMLIFrameElement | null;
  if (iframe) shellSSE.unregisterIframe(iframe);
  overlayEl?.remove();
  overlayEl = null;
  document.body.classList.remove('app-open');
}

export function isAppOverlayOpen(): boolean {
  return overlayEl !== null;
}
