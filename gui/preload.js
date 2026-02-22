const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  startServer: () => ipcRenderer.invoke('start-server'),
  stopServer: () => ipcRenderer.invoke('stop-server'),
  openBrowser: () => ipcRenderer.invoke('open-browser'),
  // event subscriptions
  onLog: (cb) => { ipcRenderer.on('log', (ev, msg) => cb(msg)); },
  onStatus: (cb) => { ipcRenderer.on('status', (ev, obj) => cb(obj)); }
});
