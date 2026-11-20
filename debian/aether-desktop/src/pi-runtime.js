'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');

function findPiBridge(appContext) {
  const candidates = [];
  const cwd = process.cwd();
  // 1) packaged extraResources
  if (appContext && appContext.resourcesPath) {
    candidates.push(path.join(appContext.resourcesPath, 'pi-bridge'));
  }
  // 2) vendored copy next to app (source/dev)
  if (appContext && appContext.appDir) {
    candidates.push(path.join(appContext.appDir, 'vendor', 'pi-bridge'));
  }
  // 3) monorepo source checkout
  candidates.push(path.resolve(__dirname, '..', '..', '..', 'pi-bridge'));
  candidates.push(path.resolve(cwd, 'pi-bridge'));
  for (const root of candidates) {
    if (!root) continue;
    const distEntry = path.join(root, 'dist', 'bridge.mjs');
    if (fs.existsSync(distEntry)) return { root, entry: distEntry, mode: 'dist' };
  }
  // fallback to TS source is not practical without build; report best-known root
  for (const root of candidates) {
    if (root && fs.existsSync(path.join(root, 'package.json'))) return { root, entry: null, mode: 'source' };
  }
  return null;
}

class PiRuntime {
  constructor(options = {}) {
    this.appContext = options.appContext || {};
    this.onEvent = typeof options.onEvent === 'function' ? options.onEvent : () => {};
    this.nodePath = options.nodePath || process.env.AETHER_NODE || 'node';
    this.child = null;
    this.rl = null;
    this.pending = new Map(); // id -> {resolve,reject,kind,streamBuf}
    this.currentTurnId = null;
    this.sessionId = options.sessionId || `desktop-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  }

  getBridgeInfo() {
    return findPiBridge(this.appContext);
  }

  _ensureProcess() {
    if (this.child && !this.child.killed) return;
    const info = findPiBridge(this.appContext);
    if (!info) {
      throw new Error('pi-bridge не найден. Запустите из исходников репозитория или установите пакет с включённым bridge.');
    }
    if (!info.entry) {
      throw new Error(`pi-bridge найден (${info.root}), но dist/bridge.mjs отсутствует. Выполните: cd "${info.root}" && npm install && npm run build`);
    }
    let child;
    try {
      child = spawn(this.nodePath, [info.entry], {
        cwd: info.root,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      });
    } catch (e) {
      throw new Error(`Не удалось запустить Node.js (${this.nodePath}) для pi-bridge: ${e && e.message || e}`);
    }
    this.child = child;
    this.rl = readline.createInterface({ input: child.stdout });
    this.rl.on('line', (line) => this._onLine(line));
    child.stderr.on('data', (d) => {
      const msg = d.toString();
      this.onEvent({ event: 'bridge_stderr', payload: { message: msg } });
    });
    child.on('error', (err) => {
      this._rejectAll(new Error(`Ошибка процесса pi-bridge: ${err && err.message || err}`));
      this.child = null;
    });
    child.on('exit', (code, signal) => {
      const err = new Error(`pi-bridge завершился (code=${code}, signal=${signal || ''})`);
      this._rejectAll(err);
      this.child = null;
      this.rl = null;
    });
  }

  _rejectAll(err) {
    for (const [, p] of this.pending) {
      try { p.reject(err); } catch (_e) {}
    }
    this.pending.clear();
    this.currentTurnId = null;
  }

  _onLine(line) {
    const text = String(line || '').trim();
    if (!text) return;
    let frame;
    try { frame = JSON.parse(text); } catch (_e) {
      this.onEvent({ event: 'bridge_raw', payload: { line: text } });
      return;
    }
    const type = frame.type;
    const id = frame.id;
    if (type === 'event') {
      const ev = { type: 'event', id, event: frame.event || '', payload: frame.payload || {}, ok: frame.ok };
      this.onEvent(ev);
      // no resolve on events
      return;
    }
    if (type === 'response' || type === 'error') {
      const pending = id ? this.pending.get(id) : null;
      this.onEvent({ type, id, ok: frame.ok, payload: frame.payload || {}, error: frame.error || null });
      if (pending) {
        this.pending.delete(id);
        if (id === this.currentTurnId) this.currentTurnId = null;
        if (type === 'error' || frame.ok === false) {
          const msg = (frame.error && frame.error.message) || 'Ошибка pi-bridge';
          const e = new Error(msg);
          e.code = frame.error && frame.error.code;
          pending.reject(e);
        } else {
          pending.resolve(frame.payload || {});
        }
      }
      return;
    }
    // unknown frame
    this.onEvent({ event: 'bridge_frame', payload: frame });
  }

  request(type, payload, opts = {}) {
    this._ensureProcess();
    const id = opts.id || `req-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const frame = { type, id, payload: payload || {} };
    const line = JSON.stringify(frame) + '\n';
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, type });
      try {
        this.child.stdin.write(line);
      } catch (e) {
        this.pending.delete(id);
        reject(e);
        return;
      }
      if (type === 'run_turn' || type === 'complete_once') this.currentTurnId = id;
    });
  }

  async setModelConfig(config) {
    const cfg = config || {};
    return this.request('set_model_config', {
      model_config: {
        provider_id: cfg.provider || 'openai',
        base_url: cfg.baseUrl || '',
        api_key: cfg.apiKey || '',
        model_id: cfg.model || '',
      },
    });
  }

  async sendTurn({ text, history, settings, workspaceDirectory }) {
    const s = settings || {};
    await this.setModelConfig(s);
    const messages = Array.isArray(history) ? history.slice() : [];
    // add new user message
    messages.push({ role: 'user', content: String(text || ''), timestamp: Date.now() });
    const payload = {
      session_id: this.sessionId,
      workspace_directory: workspaceDirectory || s.workspaceDirectory || process.cwd(),
      workspace_trusted: true,
      model_config: {
        provider_id: s.provider || 'openai',
        base_url: s.baseUrl || '',
        api_key: s.apiKey || '',
        model_id: s.model || '',
      },
      system_prompt: '',
      messages,
      host_tools: [],
      runtime: 'desktop',
    };
    this.onEvent({ event: 'user_message_appended', payload: { text: String(text || '') } });
    const result = await this.request('run_turn', payload);
    return result;
  }

  async abort() {
    if (!this.child || this.child.killed) return { aborted: false };
    const payload = {};
    if (this.currentTurnId) payload.request_id = this.currentTurnId;
    payload.session_id = this.sessionId;
    try {
      return await this.request('abort', payload, { id: `abort-${Date.now()}` });
    } catch (_e) {
      // best effort
      return { aborted: false };
    }
  }

  dispose() {
    try { if (this.rl) this.rl.close(); } catch (_e) {}
    try { if (this.child && !this.child.killed) this.child.kill(); } catch (_e) {}
    this._rejectAll(new Error('PiRuntime disposed'));
    this.child = null;
    this.rl = null;
  }
}

module.exports = { PiRuntime, findPiBridge };
