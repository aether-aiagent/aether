(function () {
  'use strict';

  const api = window.aetherDesktop || null;

  // ---------- DOM ----------
  const messagesEl = document.getElementById('messages');
  const inputEl = document.getElementById('composer-input');
  const sendBtn = document.getElementById('send-btn');
  const abortBtn = document.getElementById('abort-btn');
  const streamStatusEl = document.getElementById('stream-status');
  const runtimeStatusEl = document.getElementById('runtime-status');
  const sudoIndicatorEl = document.getElementById('sudo-indicator');
  const modelBadgeEl = document.getElementById('model-badge');
  const newChatBtn = document.getElementById('new-chat-btn');
  const openSettingsBtn = document.getElementById('open-settings-btn');

  // owner notice
  const ownerNoticeModal = document.getElementById('owner-notice-modal');
  const ownerNoticeOkBtn = document.getElementById('owner-notice-ok-btn');

  // settings
  const settingsModal = document.getElementById('settings-modal');
  const setProvider = document.getElementById('set-provider');
  const setBaseUrl = document.getElementById('set-base-url');
  const setApiKey = document.getElementById('set-api-key');
  const setModel = document.getElementById('set-model');
  const setWorkspace = document.getElementById('set-workspace');
  const setSudoEnabled = document.getElementById('set-sudo-enabled');
  const settingsSaveBtn = document.getElementById('settings-save-btn');
  const settingsRuntimeEl = document.getElementById('settings-runtime');

  // sudo modal
  const sudoModal = document.getElementById('sudo-modal');
  const sudoReasonEl = document.getElementById('sudo-reason');
  const sudoPasswordEl = document.getElementById('sudo-password');
  const sudoErrorEl = document.getElementById('sudo-error');
  const sudoConfirmBtn = document.getElementById('sudo-confirm-btn');
  const sudoCancelBtn = document.getElementById('sudo-cancel-btn');

  // ---------- State ----------
  const state = {
    settings: null,
    history: [], // {role, content}
    streaming: false,
    assistantBuffer: createAssistantBuffer(),
    currentAssistantMsgId: null,
    pollStates: new Map(), // key -> pollState
    sudoPrompt: null, // {resolve, reason}
  };

  let msgSeq = 0;
  function nextMsgId(prefix) { msgSeq += 1; return (prefix || 'm') + '_' + Date.now() + '_' + msgSeq; }

  // ---------- Poll logic (mirrors src/poll.js) ----------
  function normalizeOption(opt, index) {
    if (typeof opt === 'string') {
      const label = opt.trim();
      return { id: 'opt_' + index, label: label || String(index + 1) };
    }
    if (opt && typeof opt === 'object') {
      const label = String(opt.label != null ? opt.label : (opt.text != null ? opt.text : (opt.value != null ? opt.value : (opt.id != null ? opt.id : ('Вариант ' + (index + 1)))))).trim();
      const id = String(opt.id != null ? opt.id : ('opt_' + index)).trim() || ('opt_' + index);
      return { id: id, label: label || id };
    }
    return { id: 'opt_' + index, label: String(opt) };
  }
  function normalizePoll(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const question = String(raw.question != null ? raw.question : (raw.title || '')).trim();
    const optionsRaw = Array.isArray(raw.options) ? raw.options : null;
    if (!question || !optionsRaw || optionsRaw.length === 0) return null;
    const options = optionsRaw.map(normalizeOption);
    const multiple = Boolean(raw.multiple != null ? raw.multiple : (raw.multi != null ? raw.multi : raw.multiSelect));
    return { question, options, multiple };
  }
  function parsePollFenceContent(fenceContent) {
    if (typeof fenceContent !== 'string') return null;
    try {
      const parsed = JSON.parse(fenceContent.trim());
      return normalizePoll(parsed);
    } catch (_e) { return null; }
  }
  function segmentMarkdownWithPolls(markdown) {
    const src = String(markdown || '');
    const re = /```poll\s*\r?\n([\s\S]*?)```/gi;
    const segments = [];
    let cursor = 0;
    let m;
    while ((m = re.exec(src)) !== null) {
      const poll = parsePollFenceContent(m[1]);
      if (!poll) continue;
      if (m.index > cursor) segments.push({ type: 'markdown', text: src.slice(cursor, m.index) });
      segments.push({ type: 'poll', poll: poll, raw: m[0] });
      cursor = m.index + m[0].length;
    }
    if (segments.length === 0) return [{ type: 'markdown', text: src }];
    if (cursor < src.length) segments.push({ type: 'markdown', text: src.slice(cursor) });
    return segments;
  }
  function createPollState(poll, messageId, pollIndex) {
    const id = (messageId || 'msg') + '::poll::' + (pollIndex || 0);
    return {
      id: id, question: poll.question,
      options: poll.options.map(function(o){ return { id: o.id, label: o.label }; }),
      multiple: Boolean(poll.multiple),
      selected: [], customOpen: false, customText: '', answered: false, answerText: ''
    };
  }
  function labelsForSelected(st) {
    const byId = {}; (st.options || []).forEach(function(o){ byId[o.id] = o.label; });
    return (st.selected || []).map(function(id){ return byId[id]; }).filter(Boolean);
  }
  function formatPollAnswerMessage(question, answer) {
    return 'Опрос: ' + String(question || '').trim() + ' → ' + String(answer || '').trim();
  }

  // ---------- Stream assembly (mirrors src/stream.js) ----------
  function createAssistantBuffer() {
    return { text: '', reasoning: '', toolCalls: [], done: false, error: null, usage: null, meta: {} };
  }
  function applyAgentEvent(buffer, event) {
    if (!buffer) buffer = createAssistantBuffer();
    const next = {
      text: buffer.text || '', reasoning: buffer.reasoning || '',
      toolCalls: Array.isArray(buffer.toolCalls) ? buffer.toolCalls.slice() : [],
      done: buffer.done, error: buffer.error, usage: buffer.usage, meta: Object.assign({}, buffer.meta || {})
    };
    if (!event || typeof event !== 'object') return next;
    const t = event.event || event.type;
    const p = event.payload || event;
    switch (t) {
      case 'assistant_text_delta': next.text += String(p.delta || ''); break;
      case 'assistant_reasoning_delta': next.reasoning += String(p.delta || ''); break;
      case 'tool_call_start':
        next.toolCalls.push({ id: p.id || '', name: p.name || '', arguments: p.arguments, status: 'running' }); break;
      case 'tool_call_delta':
        if (next.toolCalls.length > 0) {
          const last = Object.assign({}, next.toolCalls[next.toolCalls.length - 1]);
          last.argumentsText = String(last.argumentsText || '') + String(p.delta || '');
          next.toolCalls[next.toolCalls.length - 1] = last;
        } break;
      case 'tool_call_end':
        if (next.toolCalls.length > 0) {
          const last = Object.assign({}, next.toolCalls[next.toolCalls.length - 1]);
          if (p.id) last.id = p.id; if (p.name) last.name = p.name;
          if (p.arguments !== undefined) last.arguments = p.arguments;
          last.status = 'ready';
          next.toolCalls[next.toolCalls.length - 1] = last;
        } else {
          next.toolCalls.push({ id: p.id || '', name: p.name || '', arguments: p.arguments, status: 'ready' });
        } break;
      case 'assistant_done':
        next.done = true;
        if (typeof p.assistant_text === 'string' && !next.text) next.text = p.assistant_text;
        if (typeof p.reasoning_text === 'string' && !next.reasoning) next.reasoning = p.reasoning_text;
        next.usage = p.usage || next.usage;
        next.meta = Object.assign({}, next.meta, { provider: p.provider, model: p.model, stop_reason: p.stop_reason });
        break;
      case 'assistant_error':
        next.error = p.error_message || p.message || 'Ошибка ассистента';
        next.done = true;
        if (typeof p.assistant_text === 'string' && p.assistant_text) next.text = p.assistant_text;
        break;
      case 'status':
        next.meta.status = p.message || p.state || p.status; break;
      default: break;
    }
    return next;
  }

  // ---------- Minimal markdown renderer (safe, no deps) ----------
  function escapeHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function renderInline(text) {
    let s = escapeHtml(text);
    // code spans
    s = s.replace(/`([^`\n]+)`/g, function(_, c){ return '<code>' + c + '</code>'; });
    // bold
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    // italic
    s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    // links
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" data-external="1">$1</a>');
    return s;
  }
  function renderMarkdown(md) {
    const src = String(md || '').replace(/\r\n/g, '\n');
    const lines = src.split('\n');
    let html = '';
    let i = 0;
    let inCode = false, codeLang = '', codeBuf = [];
    let inList = null; // 'ul' | 'ol'
    function closeList() { if (inList) { html += '</' + inList + '>'; inList = null; } }
    function flushCode() {
      html += '<pre><code>' + escapeHtml(codeBuf.join('\n')) + '</code></pre>';
      codeBuf = []; inCode = false; codeLang = '';
    }
    while (i < lines.length) {
      const line = lines[i];
      if (inCode) {
        if (/^```/.test(line)) { flushCode(); i++; continue; }
        codeBuf.push(line); i++; continue;
      }
      if (/^```/.test(line)) {
        closeList();
        inCode = true; codeLang = line.slice(3).trim(); codeBuf = []; i++; continue;
      }
      if (/^\s*$/.test(line)) { closeList(); i++; continue; }
      const h = line.match(/^(#{1,4})\s+(.*)$/);
      if (h) {
        closeList();
        const level = h[1].length;
        html += '<h' + level + '>' + renderInline(h[2]) + '</h' + level + '>';
        i++; continue;
      }
      const hr = line.match(/^(-{3,}|\*{3,})\s*$/);
      if (hr) { closeList(); html += '<hr>'; i++; continue; }
      const bq = line.match(/^>\s?(.*)$/);
      if (bq) {
        closeList();
        let q = [bq[1]]; i++;
        while (i < lines.length) { const m = lines[i].match(/^>\s?(.*)$/); if (!m) break; q.push(m[1]); i++; }
        html += '<blockquote>' + q.map(function(x){ return renderInline(x); }).join('<br>') + '</blockquote>';
        continue;
      }
      const ul = line.match(/^\s*[-*]\s+(.*)$/);
      const ol = line.match(/^\s*\d+\.\s+(.*)$/);
      if (ul) {
        if (inList !== 'ul') { closeList(); html += '<ul>'; inList = 'ul'; }
        html += '<li>' + renderInline(ul[1]) + '</li>'; i++; continue;
      }
      if (ol) {
        if (inList !== 'ol') { closeList(); html += '<ol>'; inList = 'ol'; }
        html += '<li>' + renderInline(ol[1]) + '</li>'; i++; continue;
      }
      // paragraph: collect consecutive non-special lines
      closeList();
      let para = [line]; i++;
      while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^```/.test(lines[i]) && !/^(#{1,4})\s+/.test(lines[i]) && !/^\s*[-*]\s+/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i]) && !/^>\s?/.test(lines[i]) && !/^(-{3,}|\*{3,})\s*$/.test(lines[i])) {
        para.push(lines[i]); i++;
      }
      html += '<p>' + para.map(renderInline).join('<br>') + '</p>';
    }
    if (inCode) flushCode();
    closeList();
    return html;
  }

  // ---------- Poll rendering ----------
  function renderPollCard(container, poll, pollState, onAnswer) {
    const card = document.createElement('div');
    card.className = 'poll-card';
    card.dataset.pollId = pollState.id;

    const q = document.createElement('div');
    q.className = 'poll-question';
    q.textContent = pollState.question;
    card.appendChild(q);

    const opts = document.createElement('div');
    opts.className = 'poll-options';
    pollState.options.forEach(function(opt) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'poll-option' + (pollState.selected.indexOf(opt.id) >= 0 ? ' selected' : '');
      btn.textContent = opt.label;
      btn.disabled = !!pollState.answered;
      btn.addEventListener('click', function() {
        if (pollState.answered) return;
        if (pollState.multiple) {
          const idx = pollState.selected.indexOf(opt.id);
          if (idx >= 0) pollState.selected.splice(idx, 1); else pollState.selected.push(opt.id);
        } else {
          pollState.selected = pollState.selected[0] === opt.id ? [] : [opt.id];
        }
        updatePollCard(card, pollState, onAnswer);
      });
      opts.appendChild(btn);
    });
    card.appendChild(opts);

    const actions = document.createElement('div');
    actions.className = 'poll-actions';
    const submitBtn = document.createElement('button');
    submitBtn.type = 'button'; submitBtn.className = 'btn btn-primary'; submitBtn.textContent = 'Отправить';
    submitBtn.disabled = !!pollState.answered || pollState.selected.length === 0;
    submitBtn.addEventListener('click', function() {
      if (pollState.answered) return;
      const labels = labelsForSelected(pollState);
      if (labels.length === 0) return;
      pollState.answered = true;
      pollState.answerText = labels.join(', ');
      pollState.customOpen = false;
      updatePollCard(card, pollState, onAnswer);
      onAnswer(formatPollAnswerMessage(pollState.question, pollState.answerText));
    });
    actions.appendChild(submitBtn);

    const customToggle = document.createElement('button');
    customToggle.type = 'button'; customToggle.className = 'btn btn-secondary'; customToggle.textContent = 'Свой вариант';
    customToggle.disabled = !!pollState.answered;
    customToggle.addEventListener('click', function() {
      if (pollState.answered) return;
      pollState.customOpen = !pollState.customOpen;
      updatePollCard(card, pollState, onAnswer);
    });
    actions.appendChild(customToggle);
    card.appendChild(actions);

    const customWrap = document.createElement('div');
    customWrap.className = 'poll-custom' + (pollState.customOpen && !pollState.answered ? '' : ' hidden');
    const customInput = document.createElement('input');
    customInput.type = 'text'; customInput.placeholder = 'Введите свой ответ…';
    customInput.value = pollState.customText || '';
    customInput.disabled = !!pollState.answered;
    customInput.addEventListener('input', function() { pollState.customText = customInput.value; });
    customInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); customSend.click(); }
    });
    const customSend = document.createElement('button');
    customSend.type = 'button'; customSend.className = 'btn btn-primary'; customSend.textContent = 'OK';
    customSend.disabled = !!pollState.answered;
    customSend.addEventListener('click', function() {
      if (pollState.answered) return;
      const answer = String(pollState.customText || '').trim();
      if (!answer) return;
      pollState.answered = true;
      pollState.answerText = answer;
      pollState.customOpen = false;
      pollState.selected = [];
      updatePollCard(card, pollState, onAnswer);
      onAnswer(formatPollAnswerMessage(pollState.question, pollState.answerText));
    });
    customWrap.appendChild(customInput);
    customWrap.appendChild(customSend);
    card.appendChild(customWrap);

    const note = document.createElement('div');
    note.className = 'poll-note';
    note.textContent = pollState.multiple ? 'Можно выбрать несколько вариантов.' : 'Выберите один вариант или введите свой.';
    card.appendChild(note);

    const answerEl = document.createElement('div');
    answerEl.className = 'poll-answer';
    if (pollState.answered) answerEl.textContent = 'Ответ: ' + pollState.answerText;
    card.appendChild(answerEl);

    container.appendChild(card);
  }

  function updatePollCard(card, pollState, _onAnswer) {
    // re-render in place for simplicity
    const parent = card.parentNode;
    if (!parent) return;
    const placeholder = document.createElement('div');
    parent.replaceChild(placeholder, card);
    const frag = document.createElement('div');
    renderPollCard(frag, pollState, pollState, _onAnswer);
    const newCard = frag.firstChild;
    parent.replaceChild(newCard, placeholder);
  }

  // ---------- Messages UI ----------
  function appendMessage(role, content, opts) {
    const id = (opts && opts.id) || nextMsgId('msg');
    const wrap = document.createElement('div');
    wrap.className = 'message ' + role;
    wrap.dataset.msgId = id;

    const bubble = document.createElement('div');
    bubble.className = 'bubble';

    if (role === 'assistant') {
      renderAssistantContent(bubble, content, id);
    } else if (role === 'user') {
      const md = document.createElement('div');
      md.className = 'md';
      md.innerHTML = renderMarkdown(content || '');
      bubble.appendChild(md);
    } else {
      const md = document.createElement('div');
      md.className = 'md';
      md.innerHTML = renderMarkdown(content || '');
      bubble.appendChild(md);
    }

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = (opts && opts.meta) || '';

    wrap.appendChild(bubble);
    wrap.appendChild(meta);
    messagesEl.appendChild(wrap);
    scrollToBottom();
    return { id, wrap, bubble, meta };
  }

  function renderAssistantContent(bubble, bufferOrText, msgId) {
    bubble.innerHTML = '';
    const buf = (bufferOrText && typeof bufferOrText === 'object') ? bufferOrText : { text: String(bufferOrText || ''), reasoning: '', toolCalls: [] };
    const segments = segmentMarkdownWithPolls(buf.text || '');
    let pollIndex = 0;
    segments.forEach(function(seg) {
      if (seg.type === 'markdown') {
        if (!seg.text) return;
        const md = document.createElement('div');
        md.className = 'md';
        md.innerHTML = renderMarkdown(seg.text);
        bubble.appendChild(md);
      } else if (seg.type === 'poll') {
        const key = msgId + '::' + pollIndex;
        let ps = state.pollStates.get(key);
        if (!ps) { ps = createPollState(seg.poll, msgId, pollIndex); state.pollStates.set(key, ps); }
        renderPollCard(bubble, seg.poll, ps, function(answerMsg) {
          // send answer as user message
          sendUserText(answerMsg);
        });
        pollIndex++;
      }
    });
    if (buf.reasoning) {
      const det = document.createElement('details');
      det.className = 'reasoning';
      const sum = document.createElement('summary');
      sum.textContent = 'Рассуждения';
      const pre = document.createElement('pre');
      pre.textContent = buf.reasoning;
      det.appendChild(sum);
      det.appendChild(pre);
      bubble.appendChild(det);
    }
    if (buf.toolCalls && buf.toolCalls.length) {
      const det = document.createElement('details');
      det.className = 'reasoning';
      const sum = document.createElement('summary');
      sum.textContent = 'Инструменты (' + buf.toolCalls.length + ')';
      const pre = document.createElement('pre');
      pre.textContent = buf.toolCalls.map(function(tc){ return (tc.status || '?') + ' ' + (tc.name || tc.id || 'tool'); }).join('\n');
      det.appendChild(sum); det.appendChild(pre);
      bubble.appendChild(det);
    }
    if (buf.error) {
      const err = document.createElement('div');
      err.className = 'form-error';
      err.textContent = buf.error;
      bubble.appendChild(err);
    }
  }

  function updateAssistantMessage(msgId, buffer) {
    const wrap = messagesEl.querySelector('[data-msg-id="' + msgId + '"]');
    if (!wrap) return;
    const bubble = wrap.querySelector('.bubble');
    if (!bubble) return;
    renderAssistantContent(bubble, buffer, msgId);
    scrollToBottom();
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function addSystem(text) {
    appendMessage('system', text);
  }

  // ---------- Chat flow ----------
  async function sendUserText(text) {
    const t = String(text || '').trim();
    if (!t || state.streaming) return;
    appendMessage('user', t);
    state.history.push({ role: 'user', content: t });

    state.streaming = true;
    sendBtn.disabled = true;
    abortBtn.disabled = false;
    setStreamStatus('Запрос к агенту…');

    state.assistantBuffer = createAssistantBuffer();
    const am = appendMessage('assistant', state.assistantBuffer, { meta: 'генерация…' });
    state.currentAssistantMsgId = am.id;

    let result;
    try {
      result = await api.sendMessage({ text: t, history: state.history.slice(0, -1) });
    } catch (e) {
      state.assistantBuffer.error = e && e.message ? e.message : String(e);
      state.assistantBuffer.done = true;
    }

    if (result && result.ok === false && result.error && !state.assistantBuffer.error) {
      state.assistantBuffer.error = result.error;
      state.assistantBuffer.done = true;
    }

    // finalize from result if stream didn't deliver done
    if (result && result.ok && result.result) {
      const r = result.result;
      if (!state.assistantBuffer.text && typeof r.assistant_text === 'string') state.assistantBuffer.text = r.assistant_text;
      if (!state.assistantBuffer.reasoning && typeof r.reasoning_text === 'string') state.assistantBuffer.reasoning = r.reasoning_text;
      if (r.usage) state.assistantBuffer.usage = r.usage;
      state.assistantBuffer.done = true;
    }
    if (!state.assistantBuffer.done) state.assistantBuffer.done = true;

    // record assistant in history if meaningful
    const finalText = state.assistantBuffer.text || (state.assistantBuffer.error ? ('[Ошибка: ' + state.assistantBuffer.error + ']') : '');
    if (finalText) state.history.push({ role: 'assistant', content: finalText });

    updateAssistantMessage(state.currentAssistantMsgId, state.assistantBuffer);
    const metaEl = messagesEl.querySelector('[data-msg-id="' + state.currentAssistantMsgId + '"] .meta');
    if (metaEl) metaEl.textContent = state.assistantBuffer.error ? 'ошибка' : 'готово';

    state.streaming = false;
    state.currentAssistantMsgId = null;
    sendBtn.disabled = false;
    abortBtn.disabled = true;
    setStreamStatus('');
    inputEl.focus();
  }

  function setStreamStatus(text) {
    streamStatusEl.textContent = text || '';
  }

  // ---------- Agent events from main ----------
  function onAgentEvent(ev) {
    if (!ev) return;
    const e = ev.event || ev.type ? ev : ev;
    const name = e.event || e.type || '';
    if (name === 'assistant_text_delta' || name === 'assistant_reasoning_delta' || name === 'tool_call_start' || name === 'tool_call_delta' || name === 'tool_call_end' || name === 'assistant_done' || name === 'assistant_error' || name === 'status') {
      if (state.streaming && state.currentAssistantMsgId) {
        state.assistantBuffer = applyAgentEvent(state.assistantBuffer, e);
        updateAssistantMessage(state.currentAssistantMsgId, state.assistantBuffer);
        if (e.payload && e.payload.message) setStreamStatus(e.payload.message);
      }
    } else if (name === 'bridge_stderr') {
      // debug; don't spam UI
      console.warn('[bridge]', e.payload && e.payload.message);
    } else if (name === 'response' && e.payload && e.payload.assistant_text && state.streaming && state.currentAssistantMsgId) {
      // sometimes final text arrives as response payload
      if (!state.assistantBuffer.text) state.assistantBuffer.text = e.payload.assistant_text;
      updateAssistantMessage(state.currentAssistantMsgId, state.assistantBuffer);
    }
  }

  // ---------- Settings ----------
  function openSettings() {
    settingsModal.classList.remove('hidden');
    refreshRuntimeInfo();
  }
  function closeSettings() { settingsModal.classList.add('hidden'); }
  async function loadSettings() {
    if (!api) return;
    try {
      const s = await api.getSettings();
      state.settings = s || {};
      applySettingsToForm(state.settings);
      updateBadges();
    } catch (_e) {}
  }
  function applySettingsToForm(s) {
    s = s || {};
    setProvider.value = s.provider || 'openai';
    setBaseUrl.value = s.baseUrl || '';
    setApiKey.value = s.apiKey || '';
    setModel.value = s.model || '';
    setWorkspace.value = s.workspaceDirectory || '';
    setSudoEnabled.checked = !!s.sudoEnabled;
  }
  function readSettingsFromForm() {
    return {
      provider: setProvider.value || 'openai',
      baseUrl: setBaseUrl.value || '',
      apiKey: setApiKey.value || '',
      model: setModel.value || '',
      workspaceDirectory: setWorkspace.value || '',
      sudoEnabled: !!setSudoEnabled.checked,
      extensionPaths: (state.settings && state.settings.extensionPaths) || [],
      thinkingLevel: (state.settings && state.settings.thinkingLevel) || 'off',
      ownerNoticeDismissed: !!(state.settings && state.settings.ownerNoticeDismissed),
    };
  }
  async function saveSettings() {
    if (!api) return;
    const s = readSettingsFromForm();
    try {
      const saved = await api.saveSettings(s);
      state.settings = saved;
      applySettingsToForm(saved);
      updateBadges();
      addSystem('Настройки сохранены.');
      closeSettings();
    } catch (e) {
      addSystem('Ошибка сохранения настроек: ' + (e && e.message || e));
    }
  }
  function updateBadges() {
    const s = state.settings || {};
    const modelLabel = (s.provider || 'провайдер') + (s.model ? ' / ' + s.model : '');
    modelBadgeEl.textContent = modelLabel;
  }
  async function refreshRuntimeInfo() {
    if (!api) return;
    try {
      const info = await api.getRuntimeInfo();
      const lines = [];
      lines.push('Версия: ' + (info.version || 'n/a'));
      lines.push('Electron: ' + (info.electron || 'n/a') + ', Node: ' + (info.node || 'n/a'));
      lines.push('Платформа: ' + (info.platform || '') + ' ' + (info.arch || ''));
      if (info.bridge) {
        lines.push('pi-bridge: ' + (info.bridge.mode || '?') + ' — ' + (info.bridge.root || ''));
        if (!info.bridge.entry) lines.push('Внимание: dist/bridge.mjs не найден (нужна сборка bridge).');
      } else {
        lines.push('pi-bridge: не найден (нужен исходный checkout или собранный пакет).');
      }
      settingsRuntimeEl.innerHTML = '<pre>' + escapeHtml(lines.join('\n')) + '</pre>';
      runtimeStatusEl.textContent = info.bridge ? ('bridge: ' + info.bridge.mode) : 'bridge не найден';
    } catch (e) {
      settingsRuntimeEl.textContent = 'Не удалось получить информацию о среде.';
    }
  }
  async function refreshSudoStatus() {
    if (!api) return;
    try {
      const st = await api.sudoStatus();
      const granted = st && st.granted;
      sudoIndicatorEl.textContent = granted ? 'sudo: активен' : 'sudo: выкл.';
      sudoIndicatorEl.style.color = granted ? 'var(--success)' : 'var(--muted)';
    } catch (_e) {}
  }

  // ---------- Owner notice ----------
  function maybeShowOwnerNotice() {
    if (!ownerNoticeModal) return;
    if (state.settings && state.settings.ownerNoticeDismissed) return;
    ownerNoticeModal.classList.remove('hidden');
  }
  async function dismissOwnerNotice() {
    if (ownerNoticeModal) ownerNoticeModal.classList.add('hidden');
    const next = Object.assign({}, state.settings || {}, { ownerNoticeDismissed: true });
    state.settings = next;
    if (!api) return;
    try {
      const saved = await api.saveSettings(next);
      state.settings = saved || next;
    } catch (_e) {
      // dismissal not persisted; notice will show again next start
    }
  }
  if (ownerNoticeOkBtn) ownerNoticeOkBtn.addEventListener('click', dismissOwnerNotice);

  // ---------- Sudo prompt ----------
  function openSudoModal(reason) {
    sudoReasonEl.textContent = reason || 'Требуются права администратора для этой сессии.';
    sudoPasswordEl.value = '';
    sudoErrorEl.textContent = '';
    sudoModal.classList.remove('hidden');
    setTimeout(function(){ sudoPasswordEl.focus(); }, 30);
  }
  function closeSudoModal() { sudoModal.classList.add('hidden'); }

  async function requestSudo(reason) {
    if (!api) return { granted: false };
    const st = await api.requestRoot({ reason: reason || '' });
    if (st && st.granted) { await refreshSudoStatus(); return st; }
    if (!(st && st.needsPassword)) { await refreshSudoStatus(); return st; }
    // prompt
    openSudoModal(reason);
    return new Promise(function(resolve) {
      state.sudoPrompt = { resolve: resolve, reason: reason };
    });
  }

  async function confirmSudo() {
    const password = sudoPasswordEl.value || '';
    sudoConfirmBtn.disabled = true;
    sudoErrorEl.textContent = '';
    try {
      const res = await api.requestRoot({ password: password, reason: (state.sudoPrompt && state.sudoPrompt.reason) || '' });
      if (res && res.granted) {
        closeSudoModal();
        await refreshSudoStatus();
        if (state.sudoPrompt) state.sudoPrompt.resolve(res);
        state.sudoPrompt = null;
      } else {
        const msg = (res && res.error && (res.error.message || res.error)) || (res && res.lastError) || 'Не удалось получить права sudo.';
        sudoErrorEl.textContent = msg;
        if (res && res.status && res.status.attemptsUsed >= (res.status.maxAttempts || 3)) {
          // no more attempts this flow
        }
      }
    } catch (e) {
      sudoErrorEl.textContent = e && e.message ? e.message : String(e);
    } finally {
      sudoConfirmBtn.disabled = false;
      sudoPasswordEl.value = '';
    }
  }
  function cancelSudo() {
    closeSudoModal();
    if (state.sudoPrompt) state.sudoPrompt.resolve({ granted: false, cancelled: true });
    state.sudoPrompt = null;
  }

  // ---------- Events wiring ----------
  function onSendClick() {
    const t = inputEl.value || '';
    if (!t.trim()) return;
    inputEl.value = '';
    autoResize();
    sendUserText(t);
  }
  function autoResize() {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 220) + 'px';
  }

  sendBtn.addEventListener('click', onSendClick);
  abortBtn.addEventListener('click', async function() {
    if (!api) return;
    try { await api.abortAgent(); } catch (_e) {}
    setStreamStatus('Остановка…');
  });
  newChatBtn.addEventListener('click', function() {
    if (state.streaming) return;
    state.history = [];
    state.pollStates.clear();
    messagesEl.innerHTML = '';
    addSystem('Новый чат. История очищена.');
  });
  openSettingsBtn.addEventListener('click', openSettings);
  settingsSaveBtn.addEventListener('click', saveSettings);

  inputEl.addEventListener('input', autoResize);
  inputEl.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSendClick();
    }
  });

  // modal close handlers
  document.querySelectorAll('[data-close="settings"]').forEach(function(el) {
    el.addEventListener('click', closeSettings);
  });
  sudoConfirmBtn.addEventListener('click', confirmSudo);
  sudoCancelBtn.addEventListener('click', cancelSudo);
  sudoPasswordEl.addEventListener('keydown', function(e){ if (e.key === 'Enter') { e.preventDefault(); confirmSudo(); } });

  // external links
  document.addEventListener('click', function(e) {
    const a = e.target && e.target.closest ? e.target.closest('a[data-external="1"]') : null;
    if (a && api && api.openExternal) {
      e.preventDefault();
      api.openExternal(a.getAttribute('href'));
    }
  });

  if (api && api.onStream) api.onStream(onAgentEvent);
  if (api && api.onMenuAction) api.onMenuAction(function(act) {
    if (act && act.action === 'open-settings') openSettings();
  });

  // ---------- Init ----------
  async function init() {
    if (!api) {
      addSystem('Ошибка: preload API недоступен. Запустите приложение в Electron.');
      return;
    }
    await loadSettings();
    maybeShowOwnerNotice();
    await refreshRuntimeInfo();
    await refreshSudoStatus();
    addSystem('Добро пожаловать в Aether. Настройте провайдера и модель в «Настройки», затем начните чат. Для работы агента Pi с инструментами требуется собранный pi-bridge (dist/bridge.mjs) и Node.js.');
    // expose sudo request helper for dev console / future tool hooks
    window.__aetherRequestSudo = requestSudo;
    // periodic sudo status refresh
    setInterval(refreshSudoStatus, 15000);
  }

  init();
})();
