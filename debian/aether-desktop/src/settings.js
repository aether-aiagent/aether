'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_SETTINGS = {
  provider: 'openai',
  baseUrl: '',
  apiKey: '',
  model: '',
  sudoEnabled: false,
  extensionPaths: [],
  workspaceDirectory: '',
  thinkingLevel: 'off',
};

function getConfigDir(homeDir) {
  const home = homeDir || process.env.HOME || process.env.USERPROFILE || '';
  return path.join(home, '.config', 'aether-desktop');
}

function getSettingsPath(homeDir) {
  return path.join(getConfigDir(homeDir), 'settings.json');
}

function redactSettings(settings) {
  const s = { ...(settings || {}) };
  if (s.apiKey) s.apiKey = '***';
  return s;
}

function sanitizeSettings(input) {
  const src = input && typeof input === 'object' ? input : {};
  const out = { ...DEFAULT_SETTINGS };
  if (typeof src.provider === 'string') out.provider = src.provider.trim() || DEFAULT_SETTINGS.provider;
  if (typeof src.baseUrl === 'string') out.baseUrl = src.baseUrl.trim();
  if (typeof src.apiKey === 'string') out.apiKey = src.apiKey;
  if (typeof src.model === 'string') out.model = src.model.trim();
  if (typeof src.sudoEnabled === 'boolean') out.sudoEnabled = src.sudoEnabled;
  if (Array.isArray(src.extensionPaths)) out.extensionPaths = src.extensionPaths.filter(x => typeof x === 'string');
  if (typeof src.workspaceDirectory === 'string') out.workspaceDirectory = src.workspaceDirectory.trim();
  if (typeof src.thinkingLevel === 'string') out.thinkingLevel = src.thinkingLevel.trim() || 'off';
  // preserve unknown-but-safe scalar fields? no, keep schema tight
  return out;
}

function loadSettings(homeDir) {
  const file = getSettingsPath(homeDir);
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    return sanitizeSettings(parsed);
  } catch (_e) {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings, homeDir) {
  const dir = getConfigDir(homeDir);
  const file = getSettingsPath(homeDir);
  const sanitized = sanitizeSettings(settings);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(dir, 0o700); } catch (_e) {}
  const tmp = file + '.tmp';
  const data = JSON.stringify(sanitized, null, 2) + '\n';
  fs.writeFileSync(tmp, data, { mode: 0o600 });
  try { fs.chmodSync(tmp, 0o600); } catch (_e) {}
  fs.renameSync(tmp, file);
  try { fs.chmodSync(file, 0o600); } catch (_e) {}
  return sanitized;
}

module.exports = {
  DEFAULT_SETTINGS,
  getConfigDir,
  getSettingsPath,
  redactSettings,
  sanitizeSettings,
  loadSettings,
  saveSettings,
};
