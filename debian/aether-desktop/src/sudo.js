'use strict';

/**
 * Sudo-once-per-session state machine and helpers.
 * Pure logic separated from child_process spawning for testability.
 */

const DEFAULT_MAX_ATTEMPTS = 3;

function createSudoState() {
  return {
    granted: false,
    refresherActive: false,
    attemptsUsed: 0,
    lastError: '',
  };
}

function buildValidateArgs() {
  // sudo -S -v: read password from stdin, validate/update timestamp
  return ['-S', '-v'];
}

function buildRunArgs(command) {
  // Run command as root via login-less shell; -n to avoid prompt if not cached
  return ['-n', 'bash', '-lc', String(command == null ? '' : command)];
}

function buildRefreshArgs() {
  return ['-n', '-v'];
}

function normalizeSudoError(stderr, code) {
  const s = String(stderr || '').toLowerCase();
  if (s.includes('command not found') || (code === 127)) {
    return { kind: 'not_installed', message: 'sudo не установлен в системе.' };
  }
  if (s.includes('no tty present') || s.includes('a password is required') || s.includes('no askpass program')) {
    return { kind: 'non_interactive', message: 'sudo недоступен в неинтерактивном режиме.' };
  }
  if (s.includes('sorry, try again') || s.includes('incorrect password') || s.includes('authentication failure') || (code === 1 && s.includes('password'))) {
    return { kind: 'wrong_password', message: 'Неверный пароль sudo.' };
  }
  if (s.includes('not in the sudoers file') || s.includes('may not run sudo')) {
    return { kind: 'not_allowed', message: 'Пользователь не имеет прав sudo.' };
  }
  return { kind: 'failed', message: String(stderr || '').trim() || `sudo завершился с кодом ${code}` };
}

function canAttempt(state, maxAttempts = DEFAULT_MAX_ATTEMPTS) {
  if (!state) return false;
  if (state.granted) return true;
  return (state.attemptsUsed || 0) < maxAttempts;
}

function applyValidationResult(state, result, maxAttempts = DEFAULT_MAX_ATTEMPTS) {
  const base = { ...(state || createSudoState()) };
  if (result && result.ok) {
    return {
      ...base,
      granted: true,
      refresherActive: true,
      lastError: '',
    };
  }
  const err = (result && result.error) || { kind: 'failed', message: 'Ошибка sudo.' };
  const attemptsUsed = base.attemptsUsed + (err.kind === 'wrong_password' ? 1 : 0);
  return {
    ...base,
    granted: false,
    refresherActive: false,
    attemptsUsed,
    lastError: err.message || 'Ошибка sudo.',
  };
}

function markRefresherStopped(state) {
  return { ...(state || createSudoState()), refresherActive: false };
}

function clearSudoState() {
  return createSudoState();
}

module.exports = {
  DEFAULT_MAX_ATTEMPTS,
  createSudoState,
  buildValidateArgs,
  buildRunArgs,
  buildRefreshArgs,
  normalizeSudoError,
  canAttempt,
  applyValidationResult,
  markRefresherStopped,
  clearSudoState,
};
