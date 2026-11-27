package com.aether.app.ui.chat.components

import com.aether.app.core.ChatMessage
import com.aether.app.core.ToolCallData

/** Completed results take precedence over delayed running-state updates. */
internal fun activeToolIds(
    calls: List<ToolCallData>,
    results: Map<String, ChatMessage?>,
    runningIds: Set<String>,
): Set<String> = calls.mapNotNull { call ->
    call.id.takeIf { it in runningIds && results[it] == null }
}.toSet()
