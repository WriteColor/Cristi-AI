import type { BrowserWindow, WebPreferences } from 'electron';
import { registerSender, samePage, senderPolicy, type WindowKind } from './SenderPolicy';
const configuredSessions = new WeakSet<Electron.Session>();

export function createSecureWebPreferences(preload: string): WebPreferences {
  return { preload, sandbox: true, contextIsolation: true, nodeIntegration: false,
    webSecurity: true, webviewTag: false, allowRunningInsecureContent: false,
    // Prevent Chromium from discarding Live2D WebGL contexts when a window loses focus.
    backgroundThrottling: false };
}

export function secureWindow(window: BrowserWindow, kind: WindowKind, url: string): void {
  const contents = window.webContents;
  registerSender(contents, kind, url);
  contents.on('will-navigate', (event, target) => { if (!samePage(target, url)) event.preventDefault(); });
  contents.on('will-redirect', (event, target) => { if (!samePage(target, url)) event.preventDefault(); });
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-attach-webview', event => event.preventDefault());
  if (configuredSessions.has(contents.session)) return;
  configuredSessions.add(contents.session);
  contents.session.setPermissionRequestHandler((sender, permission, callback, details) => {
    const policy = senderPolicy(sender.id);
    const mediaTypes = ('mediaTypes' in details ? details.mediaTypes : []) ?? [];
    const allowed = policy && samePage(details.requestingUrl, policy.url) &&
      details.isMainFrame && permission === 'media' && mediaTypes.length > 0 &&
      mediaTypes.every(type => type === 'audio' ? policy.kind !== 'camera' : type === 'video' && policy.kind === 'camera');
    callback(Boolean(allowed));
  });
  contents.session.setPermissionCheckHandler((sender, permission, _origin, details) => {
    const policy = sender && senderPolicy(sender.id);
    return Boolean(policy && samePage(details.requestingUrl ?? '', policy.url) && permission === 'media' &&
      (details.mediaType === 'audio' ? policy.kind !== 'camera' : details.mediaType === 'video' && policy.kind === 'camera'));
  });
}
