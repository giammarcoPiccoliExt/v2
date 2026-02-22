const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let serverProc = null;
let serverModule = null;
let ducLaunched = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 320,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

function startServer() {
  if (serverModule || serverProc) return { ok: false, msg: 'server already running' };
  try {
    // forward console to renderer logs
    const rawLog = console.log;
    const rawErr = console.error;
    console.log = function(){
      try{ if (mainWindow && mainWindow.webContents) mainWindow.webContents.send('log', Array.from(arguments).join(' ')); }catch(e){}
      rawLog.apply(console, arguments);
    };
    console.error = function(){
      try{ if (mainWindow && mainWindow.webContents) mainWindow.webContents.send('log', '[ERR] '+Array.from(arguments).join(' ')); }catch(e){}
      rawErr.apply(console, arguments);
    };
    // require the server module directly so it runs in-process under Electron
    const serverPath = path.join(process.cwd(), 'server', 'index.js');
    serverModule = require(serverPath);
    if (mainWindow && mainWindow.webContents) mainWindow.webContents.send('status', { type: 'server', ok: true, msg: 'started' });
    return { ok: true };
  } catch (e) {
    console.error('startServer error', e.message);
    return { ok: false, msg: e.message };
  }
}

function stopServer() {
  if (serverModule && typeof serverModule.shutdown === 'function') {
    try {
      serverModule.shutdown();
      serverModule = null;
      if (mainWindow && mainWindow.webContents) mainWindow.webContents.send('status', { type: 'server', ok: false, msg: 'stopped' });
      return { ok: true };
    } catch (e) { return { ok: false, msg: e.message }; }
  }
  return { ok: false, msg: 'server not running' };
}

app.whenReady().then(() => {
  createWindow();

  ipcMain.handle('start-server', () => startServer());
  ipcMain.handle('stop-server', () => stopServer());
  ipcMain.handle('open-browser', () => {
    shell.openExternal('https://localhost:3001');
    return { ok: true };
  });
  // try to start No-IP DUC on app start
  tryLaunchDUC();

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// attempt to launch No-IP DUC if installed
function tryLaunchDUC(){
  const candidates = [
    process.env['PROGRAMFILES(X86)'] ? path.join(process.env['PROGRAMFILES(X86)'],'DUC','duc64.exe') : null,
    process.env['PROGRAMFILES'] ? path.join(process.env['PROGRAMFILES'],'DUC','duc64.exe') : null,
    path.join('C:\\Program Files (x86)\\No-IP\\DUC\\DUC.exe'),
    path.join('C:\\Program Files\\No-IP\\DUC\\DUC.exe')
  ].filter(Boolean);
  for(const p of candidates){
    try{
      const s = spawn(p, [], { detached: true, stdio: 'ignore' });
      s.unref();
      ducLaunched = true;
      if (mainWindow && mainWindow.webContents) mainWindow.webContents.send('status', { type: 'duc', ok: true, path: p });
      console.log('Launched DUC at', p);
      return true;
    }catch(e){ /* ignore */ }
  }
  ducLaunched = false;
  if (mainWindow && mainWindow.webContents) mainWindow.webContents.send('status', { type: 'duc', ok: false });
  console.log('No DUC found');
  return false;
}
