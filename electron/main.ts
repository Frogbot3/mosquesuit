import { app, BrowserWindow, dialog, protocol, session } from 'electron';
import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { WorkspaceStore } from './database/store';
import { registerIpc } from './ipc';
import { registerLifeEventsIpc } from './life-events-ipc';
import { registerFinanceIpc } from './finance-ipc';
import { printDocuments } from './event-output';
import { APP_ORIGIN, CSP, DEV_ORIGIN, isTrustedDocument, resolveAsset } from './security';

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
app.setName('Mosque Suite');
// Keep development/test fixtures separate from the packaged preview's userData.
const testProfile = !app.isPackaged && process.env.MOSQUE_TEST_PROFILE;
if (testProfile && !/^test-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(testProfile)) throw new Error('Invalid test profile.');
const financeDemo = !app.isPackaged && Boolean(testProfile || process.env.MOSQUE_FINANCE_DEMO === '1');
const lifeEventsDemo = !app.isPackaged && Boolean(testProfile || financeDemo || process.env.MOSQUE_LIFE_EVENTS_DEMO === '1');
if (!app.isPackaged) app.setPath('userData', join(app.getPath('appData'), 'Mosque Suite Development', testProfile || (financeDemo ? 'finance-demo' : lifeEventsDemo ? 'life-events-demo' : 'workspace')));
const development = !app.isPackaged && process.env.MOSQUE_DEV_URL === DEV_ORIGIN;
let store: WorkspaceStore | undefined;
let mainWindow: BrowserWindow | undefined;

const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();
else {
  app.on('second-instance', () => {
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.show(); mainWindow?.focus();
  });
  void app.whenReady().then(async () => {
    try {
      mkdirSync(app.getPath('userData'), { recursive: true });
      store = new WorkspaceStore(join(app.getPath('userData'), 'mosque-suite.sqlite3'), lifeEventsDemo,financeDemo);
      const rendererRoot = join(__dirname, '../dist');
      const mimeTypes: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
      await protocol.handle('app', async request => {
        const printPage = request.method === 'GET' && printDocuments.get(new URL(request.url).pathname);
        if (printPage) return new Response(printPage, { headers: { 'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':CSP,'X-Content-Type-Options':'nosniff' } });
        const asset = resolveAsset(rendererRoot, request.url);
        if (!asset || request.method !== 'GET') return new Response('Not found', { status: 404 });
        const type = mimeTypes[extname(asset)];
        if (!type) return new Response('Not found', { status: 404 });
        try {
          return new Response(new Uint8Array(await readFile(asset)), { headers: { 'Content-Type': type, 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff' } });
        } catch { return new Response('Not found', { status: 404 }); }
      });
      const ses = session.defaultSession;
      ses.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
      ses.setPermissionCheckHandler(() => false);
      ses.on('will-download', event => event.preventDefault());
      ses.webRequest.onBeforeRequest((details, callback) => {
        const url = new URL(details.url);
        const allowed = url.protocol === 'app:' && url.hostname === 'mosque' ||
          development && (url.origin === DEV_ORIGIN || url.origin === 'ws://127.0.0.1:5173');
        callback({ cancel: !allowed });
      });
      ses.webRequest.onHeadersReceived((details, callback) => {
        const policy = development
          ? CSP.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'").replace("style-src 'self'", "style-src 'self' 'unsafe-inline'").replace("connect-src 'none'", `connect-src 'self' ws://127.0.0.1:5173`)
          : CSP;
        callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [policy] } });
      });
      mainWindow = new BrowserWindow({
        title: 'Mosque Suite', width: 1440, height: 1000, minWidth: 980, minHeight: 700,
        backgroundColor: '#f3f5f7', show: false, autoHideMenuBar: true,
        webPreferences: {
          preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false,
          sandbox: true, webSecurity: true, allowRunningInsecureContent: false, webviewTag: false,
          spellcheck: false, devTools: !app.isPackaged,
        },
      });
      mainWindow.removeMenu();
      mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      mainWindow.webContents.on('will-navigate', (event, url) => { if (!isTrustedDocument(url, development)) event.preventDefault(); });
      mainWindow.webContents.on('will-attach-webview', event => event.preventDefault());
      mainWindow.webContents.on('will-prevent-unload', event => {
        if (!mainWindow || !store) return;
        const malayalam = store.getSettings().locale === 'ml';
        const choice = dialog.showMessageBoxSync(mainWindow, {
          type: 'question', title: 'Mosque Suite',
          message: malayalam ? 'സൂക്ഷിക്കാതെ മടങ്ങണോ?' : 'Leave without saving?',
          detail: malayalam ? 'സൂക്ഷിക്കാത്ത മാറ്റങ്ങൾ നഷ്ടപ്പെടും.' : 'Your unsaved changes will be discarded.',
          buttons: malayalam ? ['തിരുത്തൽ തുടരുക', 'ഉപേക്ഷിച്ച് മടങ്ങുക'] : ['Keep editing', 'Discard and leave'],
          defaultId: 0, cancelId: 0, noLink: true,
        });
        // In Electron this event's preventDefault permits the blocked unload.
        if (choice === 1) event.preventDefault();
      });
      registerIpc(mainWindow, store, {
        environment: app.isPackaged ? 'preview' : testProfile ? 'test' : 'development',
        version: app.getVersion(), canResetDemo: !app.isPackaged,
      }, development);
      registerLifeEventsIpc(mainWindow,store,development,rendererRoot);
      registerFinanceIpc(mainWindow,store,development,rendererRoot);
      mainWindow.once('ready-to-show', () => mainWindow?.show());
      await mainWindow.loadURL(development ? `${DEV_ORIGIN}/` : `${APP_ORIGIN}/index.html`);
    } catch {
      dialog.showErrorBox('Mosque Suite could not start', 'The local workspace could not be opened. No database was replaced. Close other copies and try again. If this continues, preserve your user data and contact your administrator.');
      app.exit(1);
    }
  });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => store?.close());
}
