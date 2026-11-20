'use strict';

const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, ipcMain, Menu, shell, dialog } = require('electron');
const settingsStore = require('./src/settings');
const { isAllowedExternalUrl } = require('./src/external-links');
const { SudoManager } = require('./src/sudo-runtime');
const { PiRuntime, findPiBridge } = require('./src/pi-runtime');

let mainWindow = null;
let piRuntime = null;
const sudoManager = new SudoManager();

function getAppDir() {
  return __dirname;
}

function getResourcePiBridgeDir() {
  // extraResources copied to process.resourcesPath/pi-bridge
  try {
    return path.join(process.resourcesPath, 'pi-bridge');
  } catch (_e) {
    return null;
  }
}

function createWindow() {
  const iconPath = path.join(__dirname, 'build', 'icon.png');
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 640,
    title: 'Aether',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    backgroundColor: '#262626',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
    show: false,
  });

  mainWindow.once('ready-to-show', () => {
    if (mainWindow) mainWindow.show();
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });

  return mainWindow;
}

function getOrCreatePiRuntime() {
  if (!piRuntime) {
    piRuntime = new PiRuntime({
      appContext: {
        appDir: getAppDir(),
        resourcesPath: process.resourcesPath,
      },
      onEvent: (ev) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('agent:event', ev);
        }
      },
    });
  }
  return piRuntime;
}

function buildMenu() {
  const template = [
    {
      label: 'Файл',
      submenu: [
        {
          label: 'Настройки',
          accelerator: 'CmdOrCtrl+,',
          click: () => mainWindow && mainWindow.webContents.send('menu:action', { action: 'open-settings' }),
        },
        { type: 'separator' },
        { role: 'quit', label: 'Выход' },
      ],
    },
    {
      label: 'Правка',
      submenu: [
        { role: 'undo', label: 'Отменить' },
        { role: 'redo', label: 'Повторить' },
        { type: 'separator' },
        { role: 'cut', label: 'Вырезать' },
        { role: 'copy', label: 'Копировать' },
        { role: 'paste', label: 'Вставить' },
        { role: 'selectAll', label: 'Выделить всё' },
      ],
    },
    {
      label: 'Вид',
      submenu: [
        { role: 'reload', label: 'Перезагрузить' },
        { role: 'toggleDevTools', label: 'Инструменты разработчика' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Сброс масштаба' },
        { role: 'zoomIn', label: 'Увеличить' },
        { role: 'zoomOut', label: 'Уменьшить' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Полноэкранный режим' },
      ],
    },
    {
      label: 'Справка',
      submenu: [
        {
          label: 'О приложении',
          click: () => {
            dialog.showMessageBox(mainWindow || undefined, {
              type: 'info',
              title: 'О программе Aether',
              message: 'Aether Desktop',
              detail: `Версия: ${app.getVersion()}\nAI-агент Aether для Debian.`,
            });
          },
        },
      ],
    },
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function registerIpc() {
  ipcMain.handle('settings:get', async () => {
    return settingsStore.loadSettings();
  });

  ipcMain.handle('settings:save', async (_event, settings) => {
    const saved = settingsStore.saveSettings(settings || {});
    // changing settings may affect runtime model config; keep runtime but allow reconfigure on next send
    return saved;
  });

  ipcMain.handle('runtime:info', async () => {
    const bridge = findPiBridge({ appDir: getAppDir(), resourcesPath: process.resourcesPath });
    return {
      version: app.getVersion(),
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome,
      platform: process.platform,
      arch: process.arch,
      bridge,
    };
  });

  ipcMain.handle('app:info', async () => {
    return { name: 'Aether', version: app.getVersion(), platform: process.platform, arch: process.arch };
  });

  ipcMain.handle('sudo:status', async () => {
    return sudoManager.status;
  });

  ipcMain.handle('sudo:clear', async () => {
    return sudoManager.clear();
  });

  ipcMain.handle('sudo:request', async (_event, payload) => {
    const p = (payload && typeof payload === 'object') ? payload : { reason: payload };
    const password = p.password != null ? String(p.password) : null;
    const reason = p.reason || '';
    if (sudoManager.isGranted()) return { granted: true, status: sudoManager.status, reason };
    if (password == null) {
      return { granted: false, needsPassword: true, status: sudoManager.status, reason };
    }
    const res = await sudoManager.ensureAccess(password);
    return { ...res, reason };
  });

  ipcMain.handle('sudo:run', async (_event, command, options) => {
    const settings = settingsStore.loadSettings();
    if (!settings.sudoEnabled) {
      return { ok: false, error: 'Режим sudo отключён в настройках.', stderr: '', stdout: '', code: null };
    }
    if (!sudoManager.isGranted()) {
      return { ok: false, needsPassword: true, error: 'Требуется подтверждение sudo в этой сессии.', stderr: '', stdout: '', code: null };
    }
    return sudoManager.runCommand(String(command || ''), options || {});
  });

  ipcMain.handle('chat:send', async (_event, payload) => {
    const p = payload || {};
    const text = String(p.text || '').trim();
    if (!text) return { ok: false, error: 'Пустое сообщение' };
    const settings = settingsStore.loadSettings();
    let runtime;
    try {
      runtime = getOrCreatePiRuntime();
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      if (mainWindow) mainWindow.webContents.send('agent:event', { event: 'assistant_error', payload: { error_message: msg } });
      return { ok: false, error: msg };
    }
    const history = Array.isArray(p.history) ? p.history : [];
    try {
      const result = await runtime.sendTurn({ text, history, settings, workspaceDirectory: settings.workspaceDirectory });
      return { ok: true, result };
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      if (mainWindow) mainWindow.webContents.send('agent:event', { event: 'assistant_error', payload: { error_message: msg } });
      return { ok: false, error: msg };
    }
  });

  ipcMain.handle('chat:cancel', async () => {
    if (!piRuntime) return { ok: true, aborted: false };
    try {
      const r = await piRuntime.abort();
      return { ok: true, ...(r || {}) };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  });

  ipcMain.handle('chat:abort', async () => {
    if (!piRuntime) return { ok: true, aborted: false };
    try {
      const r = await piRuntime.abort();
      return { ok: true, ...(r || {}) };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  });

  ipcMain.handle('shell:openExternal', async (_event, url) => {
    const u = String(url || '');
    if (!isAllowedExternalUrl(u)) return { ok: false };
    await shell.openExternal(u);
    return { ok: true };
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    registerIpc();
    buildMenu();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    try { sudoManager.clear(); } catch (_e) {}
    try { if (piRuntime) piRuntime.dispose(); } catch (_e) {}
  });
}
