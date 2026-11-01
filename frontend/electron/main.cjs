const { app, BrowserWindow, ipcMain, net } = require('electron');
const path = require('path');
const http = require('http');

const DEFAULT_SERVER = 'http://127.0.0.1:8000';

let mainWindow = null;
let splashWindow = null;

// ── 初始页面 (内联，无需网络也能显示) ──

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 480,
    height: 340,
    frame: false,
    transparent: true,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
}

function createMainWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 800,
    minHeight: 560,
    frame: false,
    backgroundColor: '#f8fafc',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(url);

  mainWindow.once('ready-to-show', () => {
    if (splashWindow) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── IPC ──

function setupIPC() {
  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:maximize', () => {
    mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize();
  });
  ipcMain.handle('window:close', () => mainWindow?.close());
  ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false);

  ipcMain.handle('get:serverUrl', () => {
    return mainWindow?.webContents.getURL()?.replace(/\/+$/, '') || DEFAULT_SERVER;
  });

  ipcMain.handle('change:serverUrl', (_event, url) => {
    if (url && mainWindow) {
      mainWindow.loadURL(url);
    }
  });

  mainWindow?.on('maximize', () => {
    mainWindow?.webContents.send('window:maximizeChange', true);
  });
  mainWindow?.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximizeChange', false);
  });
}

// ── 加载策略 ──

async function loadApp() {
  createSplashWindow();

  // 先尝试远程服务器，如果超时就显示脱机提示
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const request = net.request({
      url: `${DEFAULT_SERVER}/api/health`,
      signal: controller.signal,
    });

    const response = await new Promise((resolve, reject) => {
      request.on('response', (response) => resolve(response));
      request.on('error', (err) => reject(err));
      request.end();
    });

    clearTimeout(timeout);

    if (response.statusCode === 200) {
      createMainWindow(DEFAULT_SERVER);
      setupIPC();
      return;
    }
  } catch {
    // 远程不可用，尝试本地
  }

  // ── 远程不可用，尝试本机后端 ──
  const LOCAL_URL = 'http://127.0.0.1:8000';
  try {
    const localOk = await new Promise((resolve) => {
      const req = http.get(`${LOCAL_URL}/api/health`, { timeout: 2000 }, (res) => {
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
    });

    if (localOk) {
      createMainWindow(LOCAL_URL);
      setupIPC();
      return;
    }
  } catch {
    // 本地也不可用
  }

  // ── 都不可用 — 显示脱机页面 ──
  if (splashWindow) {
    splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
      <!DOCTYPE html>
      <html><head><meta charset="UTF-8"><style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family: system-ui, sans-serif; background: linear-gradient(135deg, #4f46e5, #7c3aed); color: white; height: 100vh; display: flex; align-items: center; justify-content: center; border-radius: 12px; }
        .box { text-align: center; max-width: 320px; }
        h2 { font-size: 20px; margin-bottom: 12px; }
        p { font-size: 13px; opacity: 0.8; line-height: 1.6; margin-bottom: 20px; }
        button { background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3); color: white; padding: 10px 24px; border-radius: 10px; font-size: 14px; cursor: pointer; }
        button:hover { background: rgba(255,255,255,0.25); }
      </style></head>
      <body>
        <div class="box">
          <h2>无法连接到服务器</h2>
          <p>请确保网络连接正常，或尝试在「登录」页面更改服务器地址后刷新。</p>
          <button onclick="window.location.reload()">重新连接</button>
        </div>
      </body></html>
    `)}`);
  }
}

// ── 生命周期 ──

app.whenReady().then(() => {
  loadApp();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) loadApp();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
