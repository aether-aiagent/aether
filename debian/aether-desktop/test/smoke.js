'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const poll = require('../src/poll');
const sudo = require('../src/sudo');
const settings = require('../src/settings');
const stream = require('../src/stream');
const { SudoManager } = require('../src/sudo-runtime');
const { makeTempHome, cleanupDir, makeMockSpawn, electronStubSource, runNodeEval } = require('./helpers');

const APP_DIR = path.resolve(__dirname, '..');

// -----------------------------
// (a) Poll parsing
// -----------------------------
test('poll: parses single-choice poll fence', () => {
  const md = [
    'Hello',
    '```poll',
    JSON.stringify({ question: 'Выбор?', options: ['A', 'B', 'C'] }),
    '```',
    'Bye',
  ].join('\n');
  const blocks = poll.extractPollBlocks(md);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].poll.question, 'Выбор?');
  assert.equal(blocks[0].poll.multiple, false);
  assert.deepEqual(blocks[0].poll.options.map(o => o.label), ['A', 'B', 'C']);
});

test('poll: parses multi-choice poll fence (multiple/multi/multiSelect shapes)', () => {
  const shapes = [
    { question: 'Q1', options: ['x','y'], multiple: true },
    { question: 'Q2', options: ['x','y'], multi: true },
    { question: 'Q3', options: ['x','y'], multiSelect: true },
  ];
  for (const s of shapes) {
    const md = '```poll\n' + JSON.stringify(s) + '\n```';
    const blocks = poll.extractPollBlocks(md);
    assert.equal(blocks.length, 1, 'shape should parse: ' + JSON.stringify(s));
    assert.equal(blocks[0].poll.multiple, true);
  }
});

test('poll: parses custom/object option shapes and title alias', () => {
  const md = '```poll\n' + JSON.stringify({
    title: 'Тема?',
    options: [
      'Текстом',
      { id: 'opt_b', label: 'Метка' },
      { text: 'Через text' },
      { value: 'Через value' },
    ],
  }) + '\n```';
  const blocks = poll.extractPollBlocks(md);
  assert.equal(blocks.length, 1);
  const p = blocks[0].poll;
  assert.equal(p.question, 'Тема?');
  assert.equal(p.options.length, 4);
  assert.equal(p.options[1].id, 'opt_b');
  assert.equal(p.options[1].label, 'Метка');
  assert.equal(p.options[2].label, 'Через text');
  assert.equal(p.options[3].label, 'Через value');
});

test('poll: ignores invalid/empty fences and preserves order', () => {
  const md = [
    'pre',
    '```poll', 'not json', '```',
    'mid',
    '```poll', JSON.stringify({ question: 'One', options: ['a'] }), '```',
    '```poll', JSON.stringify({ question: '', options: ['a'] }), '```',
    '```poll', JSON.stringify({ question: 'Two', options: [] }), '```',
    '```poll', JSON.stringify({ question: 'Three', options: [{label:'z'}] }), '```',
    'post',
  ].join('\n');
  const blocks = poll.extractPollBlocks(md);
  assert.deepEqual(blocks.map(b => b.poll.question), ['One', 'Three']);
  const segs = poll.segmentMarkdownWithPolls(md);
  assert.equal(segs.filter(s => s.type === 'poll').length, 2);
  assert.ok(segs[0].type === 'markdown' && segs[0].text.includes('pre'));
  assert.ok(segs[segs.length - 1].type === 'markdown' && segs[segs.length - 1].text.includes('post'));
});

// (b) poll card state transitions incl. inline custom-answer submit
test('poll: single-select toggle and submit selection', () => {
  const p = { question: 'Pick', options: [{id:'a',label:'Alpha'},{id:'b',label:'Beta'}], multiple: false };
  let st = poll.createPollState(p, 'm1', 0);
  st = poll.togglePollOption(st, 'a');
  assert.deepEqual(st.selected, ['a']);
  st = poll.togglePollOption(st, 'b'); // switch
  assert.deepEqual(st.selected, ['b']);
  st = poll.togglePollOption(st, 'b'); // deselect
  assert.deepEqual(st.selected, []);
  st = poll.togglePollOption(st, 'a');
  const res = poll.submitPollSelection(st);
  assert.equal(res.state.answered, true);
  assert.equal(res.state.answerText, 'Alpha');
  assert.equal(res.message, 'Опрос: Pick → Alpha');
  // cannot change after answered
  const after = poll.togglePollOption(res.state, 'b');
  assert.deepEqual(after.selected, ['a']);
});

test('poll: multi-select toggle and submit multiple labels', () => {
  const p = { question: 'Multi', options: [{id:'a',label:'A'},{id:'b',label:'B'},{id:'c',label:'C'}], multiple: true };
  let st = poll.createPollState(p, 'm2', 0);
  st = poll.togglePollOption(st, 'a');
  st = poll.togglePollOption(st, 'c');
  st = poll.togglePollOption(st, 'a'); // remove
  assert.deepEqual(st.selected, ['c']);
  st = poll.togglePollOption(st, 'b');
  const res = poll.submitPollSelection(st);
  assert.equal(res.state.answered, true);
  assert.ok(res.state.answerText.includes('B') && res.state.answerText.includes('C'));
  assert.ok(res.message.startsWith('Опрос: Multi → '));
});

test('poll: custom answer open/edit/submit and guards', () => {
  const p = { question: 'Custom?', options: [{id:'a',label:'A'}], multiple: false };
  let st = poll.createPollState(p, 'm3', 0);
  st = poll.setPollCustomOpen(st, true);
  assert.equal(st.customOpen, true);
  st = poll.setPollCustomText(st, '  мой ответ  ');
  assert.equal(st.customText, '  мой ответ  ');
  // empty custom should not submit
  let emptyTry = poll.submitPollCustom(poll.setPollCustomText(st, '   '));
  assert.equal(emptyTry.state.answered, false);
  assert.equal(emptyTry.message, null);
  // real submit
  const res = poll.submitPollCustom(st);
  assert.equal(res.state.answered, true);
  assert.equal(res.state.answerText, 'мой ответ');
  assert.equal(res.message, 'Опрос: Custom? → мой ответ');
  assert.equal(res.state.customOpen, false);
  assert.deepEqual(res.state.selected, []);
  // cannot submit again
  const again = poll.submitPollCustom(res.state);
  assert.equal(again.message, null);
});

test('poll: cannot submit empty selection', () => {
  const p = { question: 'X', options: [{id:'a',label:'A'}], multiple: false };
  const st = poll.createPollState(p, 'm4', 0);
  const res = poll.submitPollSelection(st);
  assert.equal(res.message, null);
  assert.equal(res.state.answered, false);
});

// -----------------------------
// (c) sudo.js argument building and state machine with mocked child_process
// -----------------------------
test('sudo: argument building helpers', () => {
  assert.deepEqual(sudo.buildValidateArgs(), ['-S', '-v']);
  assert.deepEqual(sudo.buildRunArgs('id -u'), ['-n', 'bash', '-lc', 'id -u']);
  assert.deepEqual(sudo.buildRunArgs(null), ['-n', 'bash', '-lc', '']);
  assert.deepEqual(sudo.buildRefreshArgs(), ['-n', '-v']);
});

test('sudo: normalizeSudoError maps common cases', () => {
  assert.equal(sudo.normalizeSudoError('sudo: a password is required', 1).kind, 'non_interactive');
  assert.equal(sudo.normalizeSudoError('Sorry, try again.', 1).kind, 'wrong_password');
  assert.equal(sudo.normalizeSudoError('user is not in the sudoers file', 1).kind, 'not_allowed');
  assert.equal(sudo.normalizeSudoError('bash: sudo: command not found', 127).kind, 'not_installed');
  assert.equal(sudo.normalizeSudoError('some other failure', 1).kind, 'failed');
});

test('sudo: state machine wrong password attempts then grant', () => {
  let st = sudo.createSudoState();
  assert.equal(sudo.canAttempt(st), true);
  st = sudo.applyValidationResult(st, { ok: false, error: { kind: 'wrong_password', message: 'bad' } }, 3);
  assert.equal(st.attemptsUsed, 1);
  assert.equal(st.granted, false);
  st = sudo.applyValidationResult(st, { ok: false, error: { kind: 'wrong_password', message: 'bad' } }, 3);
  assert.equal(st.attemptsUsed, 2);
  st = sudo.applyValidationResult(st, { ok: true }, 3);
  assert.equal(st.granted, true);
  assert.equal(st.refresherActive, true);
  assert.equal(st.attemptsUsed, 2);
});

test('sudo: state machine exceeds attempts', () => {
  let st = sudo.createSudoState();
  for (let i = 0; i < 3; i++) {
    st = sudo.applyValidationResult(st, { ok: false, error: { kind: 'wrong_password', message: 'bad' } }, 3);
  }
  assert.equal(st.attemptsUsed, 3);
  assert.equal(sudo.canAttempt(st, 3), false);
});

test('sudo: non-password failure does not consume attempt', () => {
  let st = sudo.createSudoState();
  st = sudo.applyValidationResult(st, { ok: false, error: { kind: 'not_installed', message: 'no sudo' } }, 3);
  assert.equal(st.attemptsUsed, 0);
  assert.equal(st.granted, false);
  assert.equal(sudo.canAttempt(st, 3), true);
});

test('sudo-runtime: SudoManager with mocked spawn (success, wrong pw, run)', async () => {
  let mode = 'ok';
  const calls = [];
  const mockSpawn = makeMockSpawn((cmd, args, opts, child) => {
    calls.push({ cmd, args });
    if (args[0] === '-S' && args[1] === '-v') {
      if (mode === 'wrong') {
        child.stderr.emit('data', Buffer.from('Sorry, try again.\n'));
        child.emit('close', 1);
      } else if (mode === 'enoent') {
        child.emit('error', Object.assign(new Error('spawn sudo ENOENT'), { code: 'ENOENT' }));
      } else {
        child.emit('close', 0);
      }
      return;
    }
    if (args[0] === '-n' && args[1] === '-v') {
      child.emit('close', 0);
      return;
    }
    if (args[0] === '-n' && args[1] === 'bash') {
      child.stdout.emit('data', Buffer.from('root\n'));
      child.stderr.emit('data', Buffer.from(''));
      child.emit('close', 0);
      return;
    }
    child.emit('close', 1);
  });

  // success path
  mode = 'ok';
  let mgr = new SudoManager({ spawn: mockSpawn, refreshIntervalMs: 60_000 });
  let res = await mgr.ensureAccess('secret');
  assert.equal(res.granted, true);
  assert.equal(mgr.isGranted(), true);
  assert.ok(calls.some(c => c.cmd === 'sudo' && c.args[0] === '-S'));
  const run = await mgr.runCommand('id -u');
  assert.equal(run.ok, true);
  assert.equal(run.stdout, 'root\n');
  mgr.clear();
  assert.equal(mgr.isGranted(), false);

  // wrong password then fail attempts tracking
  mode = 'wrong';
  calls.length = 0;
  mgr = new SudoManager({ spawn: mockSpawn, maxAttempts: 2, refreshIntervalMs: 60_000 });
  res = await mgr.ensureAccess('bad');
  assert.equal(res.granted, false);
  assert.equal(res.error && (res.error.kind || ''), 'wrong_password');
  assert.equal(mgr.status.attemptsUsed, 1);
  res = await mgr.ensureAccess('bad2');
  assert.equal(mgr.status.attemptsUsed, 2);
  assert.equal(res.needsPassword, false);
  mgr.clear();

  // command not found
  mode = 'enoent';
  mgr = new SudoManager({ spawn: mockSpawn, refreshIntervalMs: 60_000 });
  res = await mgr.ensureAccess('x');
  assert.equal(res.granted, false);
  assert.equal(res.error.kind, 'not_installed');
  mgr.clear();
});

// -----------------------------
// (d) settings read/write roundtrip to a temp dir
// -----------------------------
test('settings: sanitize, save/load roundtrip, permissions best-effort', () => {
  const home = makeTempHome('aether-settings-');
  try {
    const before = settings.loadSettings(home);
    assert.equal(before.provider, settings.DEFAULT_SETTINGS.provider);
    assert.equal(before.apiKey, '');
    assert.equal(before.sudoEnabled, false);

    const saved = settings.saveSettings({
      provider: 'anthropic',
      baseUrl: ' https://api.example/v1 ',
      apiKey: 'sk-secret',
      model: ' claude-test ',
      sudoEnabled: true,
      workspaceDirectory: '/tmp/ws',
      extensionPaths: ['/a', 123, '/b'],
      unknown: 'dropme',
    }, home);
    assert.equal(saved.provider, 'anthropic');
    assert.equal(saved.baseUrl, 'https://api.example/v1');
    assert.equal(saved.apiKey, 'sk-secret');
    assert.equal(saved.model, 'claude-test');
    assert.equal(saved.sudoEnabled, true);
    assert.deepEqual(saved.extensionPaths, ['/a', '/b']);
    assert.equal(saved.unknown, undefined);

    const loaded = settings.loadSettings(home);
    assert.deepEqual(loaded, saved);
    const file = settings.getSettingsPath(home);
    assert.ok(fs.existsSync(file));
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(raw.apiKey, 'sk-secret');
    // redact helper
    const red = settings.redactSettings(loaded);
    assert.equal(red.apiKey, '***');

    // corrupt file -> defaults
    fs.writeFileSync(file, '{not-json', 'utf8');
    const fallback = settings.loadSettings(home);
    assert.equal(fallback.provider, settings.DEFAULT_SETTINGS.provider);
  } finally {
    cleanupDir(home);
  }
});

// -----------------------------
// (e) stream chunk -> message assembly logic
// -----------------------------
test('stream: assembles text/reasoning/tool events into final buffer', () => {
  const events = [
    { event: 'assistant_text_delta', payload: { delta: 'Hello' } },
    { event: 'assistant_reasoning_delta', payload: { delta: 'think' } },
    { event: 'assistant_text_delta', payload: { delta: ' world' } },
    { event: 'tool_call_start', payload: { id: 't1', name: 'bash' } },
    { event: 'tool_call_delta', payload: { delta: '{"cmd":' } },
    { event: 'tool_call_end', payload: { id: 't1', name: 'bash', arguments: { cmd: 'ls' } } },
    { event: 'assistant_done', payload: { assistant_text: 'Hello world', reasoning_text: 'think', usage: { input_tokens: 1 } } },
  ];
  const buf = stream.reduceAgentEvents(events);
  assert.equal(buf.text, 'Hello world');
  assert.equal(buf.reasoning, 'think');
  assert.equal(buf.done, true);
  assert.equal(buf.toolCalls.length, 1);
  assert.equal(buf.toolCalls[0].name, 'bash');
  assert.equal(buf.toolCalls[0].status, 'ready');
  assert.deepEqual(buf.usage, { input_tokens: 1 });
});

test('stream: handles tool_call_end without start and error event', () => {
  const buf = stream.reduceAgentEvents([
    { event: 'tool_call_end', payload: { id: 'x', name: 'read', arguments: { path: 'a' } } },
    { event: 'assistant_error', payload: { error_message: 'boom', assistant_text: 'partial' } },
  ]);
  assert.equal(buf.toolCalls.length, 1);
  assert.equal(buf.toolCalls[0].id, 'x');
  assert.equal(buf.error, 'boom');
  assert.equal(buf.done, true);
  assert.equal(buf.text, 'partial');
});

// -----------------------------
// (f) syntax checks for every .js and main/preload module resolution with electron stub
// -----------------------------
test('syntax: node --check every .js file in debian/aether-desktop (excluding vendor)', () => {
  const { spawnSync } = require('child_process');
  function walk(dir, out) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === 'vendor' || ent.name === 'node_modules' || ent.name === 'dist-electron') continue;
        walk(full, out);
      } else if (ent.isFile() && ent.name.endsWith('.js')) {
        out.push(full);
      }
    }
  }
  const files = [];
  walk(APP_DIR, files);
  assert.ok(files.length > 0, 'should find js files');
  const failures = [];
  for (const f of files.sort()) {
    const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
    if (r.status !== 0) failures.push({ file: path.relative(APP_DIR, f), stderr: (r.stderr || r.stdout || '').trim() });
  }
  assert.deepEqual(failures, [], 'syntax check failures: ' + JSON.stringify(failures, null, 2));
});

test('main/preload: required local modules resolve and load with stubbed electron', () => {
  const stub = electronStubSource();
  const preloadCode = `
    const Module = require('module');
    const path = require('path');
    const stubSrc = ${JSON.stringify(stub)};
    const origResolve = Module._resolveFilename;
    Module._resolveFilename = function(request, parent, isMain, options) {
      if (request === 'electron') return 'electron';
      return origResolve.call(this, request, parent, isMain, options);
    };
    const m = new Module('electron', null);
    m.filename = 'electron'; m.paths = Module._nodeModulePaths(process.cwd());
    m._compile(stubSrc, 'electron');
    require.cache['electron'] = m;
    require(path.join(process.cwd(), 'preload.js'));
    require(path.join(process.cwd(), 'src', 'settings.js'));
    require(path.join(process.cwd(), 'src', 'sudo.js'));
    require(path.join(process.cwd(), 'src', 'sudo-runtime.js'));
    require(path.join(process.cwd(), 'src', 'poll.js'));
    require(path.join(process.cwd(), 'src', 'stream.js'));
    require(path.join(process.cwd(), 'src', 'pi-runtime.js'));
    console.log('preload-and-modules-ok');
  `;
  const r = runNodeEval(preloadCode, APP_DIR);
  assert.equal(r.status, 0, 'preload/module load failed: ' + (r.stderr || r.stdout));
  assert.match(r.stdout, /preload-and-modules-ok/);

  const mainCode = `
    const Module = require('module');
    const path = require('path');
    const stubSrc = ${JSON.stringify(stub)};
    const origResolve = Module._resolveFilename;
    Module._resolveFilename = function(request, parent, isMain, options) {
      if (request === 'electron') return 'electron';
      return origResolve.call(this, request, parent, isMain, options);
    };
    const m = new Module('electron', null);
    m.filename = 'electron'; m.paths = Module._nodeModulePaths(process.cwd());
    m._compile(stubSrc, 'electron');
    require.cache['electron'] = m;
    require(path.join(process.cwd(), 'main.js'));
    console.log('main-load-ok');
  `;
  const r2 = runNodeEval(mainCode, APP_DIR);
  assert.equal(r2.status, 0, 'main.js load failed: ' + (r2.stderr || r2.stdout));
  assert.match(r2.stdout, /main-load-ok/);
});
