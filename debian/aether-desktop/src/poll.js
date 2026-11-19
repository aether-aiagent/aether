'use strict';

/**
 * Poll parsing and interactive poll card state logic.
 * Pure module (no DOM/Electron) for reuse in renderer and tests.
 */

function tryParsePollJson(text) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch (_e) {
    return null;
  }
}

function normalizeOption(opt, index) {
  if (typeof opt === 'string') {
    const label = opt.trim();
    return { id: `opt_${index}`, label: label || String(index + 1) };
  }
  if (opt && typeof opt === 'object') {
    const label = String(opt.label ?? opt.text ?? opt.value ?? opt.id ?? `Вариант ${index + 1}`).trim();
    const id = String(opt.id ?? `opt_${index}`).trim() || `opt_${index}`;
    return { id, label: label || id };
  }
  return { id: `opt_${index}`, label: String(opt) };
}

function normalizePoll(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const question = String(raw.question ?? raw.title ?? '').trim();
  const optionsRaw = Array.isArray(raw.options) ? raw.options : null;
  if (!question || !optionsRaw || optionsRaw.length === 0) return null;
  const options = optionsRaw.map(normalizeOption);
  const multiple = Boolean(raw.multiple ?? raw.multi ?? raw.multiSelect);
  return { question, options, multiple };
}

function parsePollFenceContent(fenceContent) {
  const parsed = tryParsePollJson(fenceContent);
  return normalizePoll(parsed);
}

/**
 * Extract poll blocks from markdown text.
 * Returns array of { poll, start, end, raw } in source order.
 */
function extractPollBlocks(markdown) {
  if (typeof markdown !== 'string' || !markdown) return [];
  const re = /```poll\s*\r?\n([\s\S]*?)```/gi;
  const blocks = [];
  let m;
  while ((m = re.exec(markdown)) !== null) {
    const poll = parsePollFenceContent(m[1]);
    if (poll) {
      blocks.push({ poll, start: m.index, end: m.index + m[0].length, raw: m[0] });
    }
  }
  return blocks;
}

/**
 * Split markdown into segments preserving poll blocks as structured items.
 * Returns [{type:'markdown', text}, {type:'poll', poll, raw}]
 */
function segmentMarkdownWithPolls(markdown) {
  const blocks = extractPollBlocks(markdown || '');
  if (blocks.length === 0) return [{ type: 'markdown', text: markdown || '' }];
  const segments = [];
  let cursor = 0;
  for (const b of blocks) {
    if (b.start > cursor) {
      segments.push({ type: 'markdown', text: markdown.slice(cursor, b.start) });
    }
    segments.push({ type: 'poll', poll: b.poll, raw: b.raw });
    cursor = b.end;
  }
  if (cursor < markdown.length) {
    segments.push({ type: 'markdown', text: markdown.slice(cursor) });
  }
  return segments;
}

function createPollState(poll, messageId, pollIndex) {
  const id = `${messageId || 'msg'}::poll::${pollIndex || 0}`;
  return {
    id,
    question: poll.question,
    options: poll.options.map(o => ({ ...o })),
    multiple: Boolean(poll.multiple),
    selected: [], // option ids
    customOpen: false,
    customText: '',
    answered: false,
    answerText: '',
  };
}

function togglePollOption(state, optionId) {
  if (!state || state.answered) return state;
  const next = { ...state, selected: [...(state.selected || [])] };
  if (state.multiple) {
    const idx = next.selected.indexOf(optionId);
    if (idx >= 0) next.selected.splice(idx, 1);
    else next.selected.push(optionId);
  } else {
    next.selected = next.selected[0] === optionId ? [] : [optionId];
  }
  return next;
}

function setPollCustomOpen(state, open) {
  if (!state || state.answered) return state;
  return { ...state, customOpen: Boolean(open) };
}

function setPollCustomText(state, text) {
  if (!state || state.answered) return state;
  return { ...state, customText: String(text == null ? '' : text) };
}

function labelsForSelected(state) {
  const byId = new Map((state.options || []).map(o => [o.id, o.label]));
  return (state.selected || []).map(id => byId.get(id)).filter(Boolean);
}

function formatPollAnswerMessage(question, answer) {
  const q = String(question || '').trim();
  const a = String(answer || '').trim();
  return `Опрос: ${q} → ${a}`;
}

function submitPollSelection(state) {
  if (!state || state.answered) return { state, message: null };
  const labels = labelsForSelected(state);
  if (labels.length === 0) return { state, message: null };
  const answer = labels.join(', ');
  const next = { ...state, answered: true, answerText: answer, customOpen: false };
  return { state: next, message: formatPollAnswerMessage(state.question, answer) };
}

function submitPollCustom(state) {
  if (!state || state.answered) return { state, message: null };
  const answer = String(state.customText || '').trim();
  if (!answer) return { state, message: null };
  const next = { ...state, answered: true, answerText: answer, customOpen: false, selected: [] };
  return { state: next, message: formatPollAnswerMessage(state.question, answer) };
}

module.exports = {
  extractPollBlocks,
  parsePollFenceContent,
  normalizePoll,
  normalizeOption,
  segmentMarkdownWithPolls,
  createPollState,
  togglePollOption,
  setPollCustomOpen,
  setPollCustomText,
  labelsForSelected,
  formatPollAnswerMessage,
  submitPollSelection,
  submitPollCustom,
};
