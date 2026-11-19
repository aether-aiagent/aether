'use strict';

const { spawn } = require('child_process');
const {
  DEFAULT_MAX_ATTEMPTS,
  createSudoState,
  buildValidateArgs,
  buildRunArgs,
  buildRefreshArgs,
  normalizeSudoError,
  canAttempt,
  applyValidationResult,
  clearSudoState,
} = require('./sudo');

const REFRESH_INTERVAL_MS = 4 * 60 * 1000;

class SudoManager {
  constructor(opts = {}) {
    this._spawn = opts.spawn || spawn;
    this._maxAttempts = opts.maxAttempts || DEFAULT_MAX_ATTEMPTS;
    this._refreshIntervalMs = opts.refreshIntervalMs || REFRESH_INTERVAL_MS;
    this._state = createSudoState();
    this._refreshTimer = null;
  }

  get status() {
    return { ...this._state, maxAttempts: this._maxAttempts };
  }

  isGranted() {
    return Boolean(this._state && this._state.granted);
  }

  async ensureAccess(password) {
    if (this.isGranted()) return { granted: true, status: this.status };
    if (!canAttempt(this._state, this._maxAttempts)) {
      return { granted: false, status: this.status, error: this._state.lastError || 'Превышено число попыток sudo.' };
    }
    const pwd = String(password == null ? '' : password);
    const result = await this._validate(pwd);
    this._state = applyValidationResult(this._state, result, this._maxAttempts);
    if (this._state.granted) this._startRefresher();
    return {
      granted: this._state.granted,
      status: this.status,
      error: result && result.error ? result.error : null,
      needsPassword: !this._state.granted && canAttempt(this._state, this._maxAttempts),
    };
  }

  _validate(password) {
    return new Promise((resolve) => {
      let stderr = '';
      let stdout = '';
      let settled = false;
      const finish = (value) => { if (settled) return; settled = true; resolve(value); };
      let child;
      try {
        child = this._spawn('sudo', buildValidateArgs(), { stdio: ['pipe', 'pipe', 'pipe'] });
      } catch (e) {
        const code = e && e.code === 'ENOENT' ? 127 : 1;
        return finish({ ok: false, code, error: normalizeSudoError(String(e && e.message || e), code) });
      }
      child.stdout.on('data', (d) => { stdout += d.toString(); });
      child.stderr.on('data', (d) => { stderr += d.toString(); });
      child.on('error', (e) => {
        const code = e && e.code === 'ENOENT' ? 127 : 1;
        finish({ ok: false, code, error: normalizeSudoError(stderr || String(e && e.message || e), code) });
      });
      child.on('close', (code) => {
        if (code === 0) return finish({ ok: true, code: 0 });
        finish({ ok: false, code: code == null ? 1 : code, error: normalizeSudoError(stderr || stdout, code) });
      });
      try {
        child.stdin.write(String(password) + '\n');
        child.stdin.end();
      } catch (_e) {}
    });
  }

  _startRefresher() {
    this._stopRefresher();
    const tick = () => {
      if (!this._state.granted) return;
      let child;
      try {
        child = this._spawn('sudo', buildRefreshArgs(), { stdio: ['ignore', 'ignore', 'ignore'] });
      } catch (_e) {
        this._state = { ...this._state, refresherActive: false };
        return;
      }
      child.on('error', () => { this._state = { ...this._state, refresherActive: false }; });
      child.on('close', (code) => {
        if (code !== 0) {
          // timestamp expired or sudo unavailable; require re-auth on next need
          this._state = { ...this._state, granted: false, refresherActive: false, lastError: 'Сессия sudo истекла.' };
          this._stopRefresher();
        }
      });
    };
    this._refreshTimer = setInterval(tick, this._refreshIntervalMs);
    if (this._refreshTimer && typeof this._refreshTimer.unref === 'function') this._refreshTimer.unref();
    this._state.refresherActive = true;
  }

  _stopRefresher() {
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
    if (this._state) this._state.refresherActive = false;
  }

  async runCommand(command, options = {}) {
    if (!this.isGranted()) {
      return { ok: false, code: null, stdout: '', stderr: '', error: 'Права sudo не предоставлены в этой сессии.' };
    }
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let settled = false;
      const finish = (value) => { if (settled) return; settled = true; resolve(value); };
      let child;
      try {
        child = this._spawn('sudo', buildRunArgs(command), {
          cwd: options.cwd || process.cwd(),
          env: { ...process.env, ...(options.env || {}) },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (e) {
        return finish({ ok: false, code: 1, stdout, stderr: String(e && e.message || e), error: String(e && e.message || e) });
      }
      child.stdout.on('data', (d) => { stdout += d.toString(); });
      child.stderr.on('data', (d) => { stderr += d.toString(); });
      child.on('error', (e) => finish({ ok: false, code: 1, stdout, stderr: stderr || String(e.message || e), error: String(e.message || e) }));
      child.on('close', (code) => finish({ ok: code === 0, code: code == null ? 1 : code, stdout, stderr }));
    });
  }

  clear() {
    this._stopRefresher();
    this._state = clearSudoState();
    return { ...this._state };
  }
}

module.exports = { SudoManager, REFRESH_INTERVAL_MS };
