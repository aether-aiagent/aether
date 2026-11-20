'use strict';

/**
 * Stream/chunk -> message assembly helpers for renderer/bridge events.
 */

function createAssistantBuffer() {
  return { text: '', reasoning: '', toolCalls: [], done: false, error: null, usage: null, meta: {} };
}

function applyAgentEvent(buffer, event) {
  if (!buffer) buffer = createAssistantBuffer();
  const next = {
    ...buffer,
    toolCalls: Array.isArray(buffer.toolCalls) ? buffer.toolCalls.slice() : [],
    meta: { ...(buffer.meta || {}) },
  };
  if (!event || typeof event !== 'object') return next;
  const t = event.event || event.type;
  const p = event.payload || event;
  switch (t) {
    case 'assistant_text_delta':
      next.text = (next.text || '') + String(p.delta || '');
      break;
    case 'assistant_reasoning_delta':
      next.reasoning = (next.reasoning || '') + String(p.delta || '');
      break;
    case 'tool_call_start':
      next.toolCalls.push({ id: p.id || '', name: p.name || '', arguments: p.arguments, status: 'running', index: p.content_index });
      break;
    case 'tool_call_delta':
      if (next.toolCalls.length > 0) {
        const last = { ...next.toolCalls[next.toolCalls.length - 1] };
        last.argumentsText = String(last.argumentsText || '') + String(p.delta || '');
        next.toolCalls[next.toolCalls.length - 1] = last;
      }
      break;
    case 'tool_call_end':
      if (next.toolCalls.length > 0) {
        const last = { ...next.toolCalls[next.toolCalls.length - 1] };
        if (p.id) last.id = p.id;
        if (p.name) last.name = p.name;
        if (p.arguments !== undefined) last.arguments = p.arguments;
        last.status = 'ready';
        next.toolCalls[next.toolCalls.length - 1] = last;
      } else {
        next.toolCalls.push({ id: p.id || '', name: p.name || '', arguments: p.arguments, status: 'ready' });
      }
      break;
    case 'assistant_done':
      next.done = true;
      if (typeof p.assistant_text === 'string' && !next.text) next.text = p.assistant_text;
      if (typeof p.reasoning_text === 'string' && !next.reasoning) next.reasoning = p.reasoning_text;
      next.usage = p.usage || next.usage;
      next.meta = { ...next.meta, provider: p.provider, model: p.model, stop_reason: p.stop_reason };
      break;
    case 'assistant_error':
      next.error = p.error_message || p.message || 'Ошибка ассистента';
      next.done = true;
      if (typeof p.assistant_text === 'string') next.text = p.assistant_text || next.text;
      break;
    case 'status':
      next.meta.status = p.message || p.state || p.status;
      break;
    default:
      // keep unknown events harmless
      break;
  }
  return next;
}

function reduceAgentEvents(events) {
  let buf = createAssistantBuffer();
  for (const e of events || []) buf = applyAgentEvent(buf, e);
  return buf;
}

module.exports = {
  createAssistantBuffer,
  applyAgentEvent,
  reduceAgentEvents,
};
