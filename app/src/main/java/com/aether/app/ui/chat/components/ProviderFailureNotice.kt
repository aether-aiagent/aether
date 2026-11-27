package com.aether.app.ui.chat.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.aether.app.R
import com.aether.app.llm.AetherFreeLimit
import com.aether.app.ui.common.TextButton

/** Quota notices replace the raw error snackbar; unrelated failures retain the existing behavior. */
@Composable
internal fun ProviderFailureNotice(
    sessionId: String?, error: String?, busy: Boolean,
    snackbar: SnackbarHostState,
    onDismiss: () -> Unit,
    onSwitchProvider: () -> Unit,
    /** For a temporary limit: wait the suggested time, then resume the task. */
    onWaitAndResume: (retryAfterSeconds: Long?) -> Unit = {},
) {
    val notice = remember(error) { AetherFreeLimit.notice(error) }
    var acknowledged by rememberSaveable(sessionId) { mutableStateOf<String?>(null) }
    LaunchedEffect(busy) { if (busy) acknowledged = null }
    LaunchedEffect(error) {
        if (error != null && notice == null) {
            snackbar.showSnackbar(error)
            onDismiss()
        } else if (error != null && error == acknowledged) onDismiss()
    }
    if (notice != null && error != acknowledged) AetherFreeLimitDialog(notice,
        onDismiss = { acknowledged = error; onDismiss() },
        onWait = {
            acknowledged = error; onDismiss()
            if (notice.kind == AetherFreeLimit.Kind.TEMPORARY) onWaitAndResume(notice.retryAfterSeconds)
        },
        onSwitchProvider = { acknowledged = error; onDismiss(); onSwitchProvider() })
}

@Composable
internal fun AetherFreeLimitDialog(
    notice: AetherFreeLimit.Notice,
    onDismiss: () -> Unit,
    onSwitchProvider: () -> Unit,
    onWait: () -> Unit = onDismiss,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(if (notice.kind == AetherFreeLimit.Kind.QUOTA)
            R.string.aether_free_quota_title else R.string.aether_free_rate_title)) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(stringResource(if (notice.kind == AetherFreeLimit.Kind.QUOTA)
                    R.string.aether_free_quota_body else R.string.aether_free_rate_body))
                notice.retryAfterSeconds?.let { seconds ->
                    val minutes = (seconds / 60 + if (seconds % 60 > 0) 1 else 0).coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
                    val count = if (seconds < 60) seconds.toInt().coerceAtLeast(1) else minutes
                    Text(pluralStringResource(if (seconds < 60) R.plurals.aether_free_retry_seconds
                        else R.plurals.aether_free_retry_minutes, count, count))
                }
            }
        },
        confirmButton = { TextButton(onClick = onSwitchProvider) { Text(stringResource(R.string.aether_switch_provider)) } },
        dismissButton = { TextButton(onClick = onWait) { Text(stringResource(if (notice.kind == AetherFreeLimit.Kind.QUOTA)
            R.string.aether_free_wait else R.string.aether_free_wait_resume)) } },
    )
}
