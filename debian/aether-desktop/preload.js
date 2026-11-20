'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, handler) {
  if (typeof handler !== 'function') return () => {};
  const listener = (_event, payload) => handler(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('aetherDesktop', {
  sendMessage: (payload) => ipcRenderer.invoke('chat:send', payload),
  cancelMessage: () => ipcRenderer.invoke('chat:cancel'),
  abortAgent: () => ipcRenderer.invoke('chat:abort'),
  onStream: (handler) => subscribe('agent:event', handler),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  requestRoot: (reason) => ipcRenderer.invoke('sudo:request', reason),
  runRootCommand: (command, options) => ipcRenderer.invoke('sudo:run', command, options || {}),
  sudoStatus: () => ipcRenderer.invoke('sudo:status'),
  sudoClear: () => ipcRenderer.invoke('sudo:clear'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  getRuntimeInfo: () => ipcRenderer.invoke('runtime:info'),
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  onMenuAction: (handler) => subscribe('menu:action', handler),
  platform: process.platform,
});
