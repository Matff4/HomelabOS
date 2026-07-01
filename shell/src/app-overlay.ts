import type { ComponentInfo, PlatformInfo, SystemConfig } from './types';
import { accentColor, shellSSE } from './api';
import { widgetQuery } from './geometry';

let overlayEl: HTMLElement | null = null;
let messageHandler: ((event: MessageEvent) => void) | null = null;
let closeHandler: (() => void) | null = null;

export function openAppOverlay(
  component: ComponentInfo,
  config: SystemConfig,
  platform: PlatformInfo,
  onClose?: () => void,
): void {
  closeAppOverlay();

  const instanceId = `app_${Date.now()}`;
  const src = `${component.entry_url}?${widgetQuery(config, instanceId, platform)}`;

  overlayEl = document.createElement('div');
  overlayEl.className = 'app-overlay';
  overlayEl.innerHTML = `<iframe class="app-overlay-frame" src="${src}" title="${component.name}"></iframe>`;

  document.body.appendChild(overlayEl);
  document.body.classList.add('app-open');
  closeHandler = onClose ?? null;

  const iframe = overlayEl.querySelector('iframe') as HTMLIFrameElement;

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
  closeHandler?.();
  closeHandler = null;
}

export function isAppOverlayOpen(): boolean {
  return overlayEl !== null;
}
