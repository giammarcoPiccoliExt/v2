const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fetch = require('node-fetch');

let mainWindow;
let serverProc = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 360,
    height: 200,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'gui.html'));
}

app.whenReady().then(createWindow);

ipcMain.handle('start-server', async () => {
  if (serverProc) return { ok: false, msg: 'already running' };
  serverProc = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], { stdio: 'ignore', detached: true });
  serverProc.unref();
  return { ok: true };
});

ipcMain.handle('stop-server', async () => {
  // naive: kill by port probe shutdown not implemented; advise restart
  if (!serverProc) return { ok: false, msg: 'not started by GUI' };
  try { process.kill(-serverProc.pid); } catch (e) {}
  serverProc = null;
  return { ok: true };
});

ipcMain.on('poll-health', async (_, port) => {
  const url = `https://localhost:${port || 3000}/health`;
  try {
    const res = await fetch(url, { method: 'GET', rejectUnauthorized: false });
    const json = await res.json();
    mainWindow.webContents.send('health', json.ok ? 'green' : 'red');
  } catch (err) {
    mainWindow.webContents.send('health', 'red');
  }
});

app.on('window-all-closed', () => app.quit());
