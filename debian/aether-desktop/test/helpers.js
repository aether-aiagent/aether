'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { EventEmitter } = require('events');
const { spawnSync } = require('child_process');

function makeTempHome(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix || 'aether-test-'));
}

function cleanupDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_e) {}
}

function makeMockSpawn(script) {
  // script is (cmd,args,opts,child)=>void invoked synchronously to emit events
  return function mockSpawn(cmd, args, opts) {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = { write: () => true, end: () => {} };
    child.killed = false;
    child.kill = () => { child.killed = true; };
    // run script async-ish to mimic process
    process.nextTick(() => {
      try { script(cmd, args, opts || {}, child); }
      catch (e) { child.emit('error', e); }
    });
    return child;
  };
}

function electronStubSource() {
  return `
const noop = () => {};
class BW {
  constructor(){ this.webContents = { send: noop, on: noop, setWindowOpenHandler: noop }, this._events = {}; }
  once(ev, fn){ this._events[ev]=fn; }
  on(ev, fn){ this._events[ev]=fn; }
  loadFile(){ return Promise.resolve(); }
  show(){ }
  focus(){ }
  isDestroyed(){ return false; }
  isMinimized(){ return false; }
  restore(){ }
  static getAllWindows(){ return []; }
}
module.exports = {
  app: {
    requestSingleInstanceLock: () => true,
    whenReady: () => Promise.resolve(),
    on: noop,
    quit: noop,
    getVersion: () => '0.0.0-test',
    isPackaged: false,
  },
  BrowserWindow: BW,
  ipcMain: { handle: noop, on: noop },
  Menu: { buildFromTemplate: () => ({}), setApplicationMenu: noop },
  shell: { openExternal: async () => {} },
  dialog: { showMessageBox: async () => ({}) },
  contextBridge: { exposeInMainWorld: noop },
  ipcRenderer: { invoke: async () => ({}), on: noop, removeListener: noop },
};
`;
}

function runNodeEval(code, cwd) {
  const res = spawnSync(process.execPath, ['-e', code], {
    cwd: cwd || process.cwd(),
    encoding: 'utf8',
    env: { ...process.env },
  });
  return res;
}

module.exports = {
  makeTempHome,
  cleanupDir,
  makeMockSpawn,
  electronStubSource,
  runNodeEval,
};
