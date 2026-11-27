package com.aether.app.data.env

import com.aether.app.IAetherService
import kotlinx.coroutines.*

/** Binder calls block their caller, so a separate child must deliver cancellation to the service. */
internal suspend fun IAetherService.execCancellable(
    cmd: Array<String>, env: Array<String>?, dir: String?, maxBytes: Int, timeoutMs: Int,
): String = withContext(Dispatchers.IO) {
    val id = registerCommand()
    try {
        coroutineScope {
            val cancellation = launch(start = CoroutineStart.UNDISPATCHED) {
                try { awaitCancellation() }
                finally {
                    withContext(NonCancellable + Dispatchers.IO) {
                        runCatching { cancelCommand(id) }
                    }
                }
            }
            try {
                ensureActive()
                execRegistered(id, cmd, env, dir, maxBytes, timeoutMs)
            } finally {
                withContext(NonCancellable) { cancellation.cancelAndJoin() }
            }
        }
    } finally {
        // Also release a reservation if cancellation wins before the watcher starts.
        withContext(NonCancellable + Dispatchers.IO) { runCatching { cancelCommand(id) } }
    }
}
