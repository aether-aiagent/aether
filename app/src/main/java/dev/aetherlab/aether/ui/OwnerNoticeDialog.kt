package dev.aetherlab.aether.ui

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.text.ClickableText
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import dev.aetherlab.aether.R
import dev.aetherlab.aether.ui.theme.AetherOnSurface
import dev.aetherlab.aether.ui.theme.AetherOnSurfaceVariant
import dev.aetherlab.aether.ui.theme.AetherSurface

private const val OwnerNoticePrefsName = "aether_owner_notice"
private const val OwnerNoticeAcknowledgedKey = "acknowledged"
private const val OwnerNoticeLinkTag = "owner_notice_url"
private const val AetherOwnerTelegramUrl = "https://t.me/AetherAIAgent"

@Composable
fun OwnerNoticeDialog() {
    val context = LocalContext.current
    val prefs = remember(context) {
        context.getSharedPreferences(OwnerNoticePrefsName, Context.MODE_PRIVATE)
    }
    var acknowledged by remember { mutableStateOf(prefs.getBoolean(OwnerNoticeAcknowledgedKey, false)) }
    var visible by remember { mutableStateOf(true) }
    if (acknowledged || !visible) return

    AlertDialog(
        onDismissRequest = { visible = false },
        containerColor = AetherSurface,
        titleContentColor = AetherOnSurface,
        textContentColor = AetherOnSurfaceVariant,
        title = {
            Text(
                text = stringResource(R.string.owner_notice_title),
                style = MaterialTheme.typography.titleLarge,
            )
        },
        text = {
            val noticeText = stringResource(R.string.owner_notice_text)
            val urlStart = noticeText.indexOf(AetherOwnerTelegramUrl)
            val annotatedText = buildAnnotatedString {
                if (urlStart >= 0) {
                    append(noticeText.substring(0, urlStart))
                    pushStringAnnotation(
                        tag = OwnerNoticeLinkTag,
                        annotation = AetherOwnerTelegramUrl,
                    )
                    withStyle(SpanStyle(color = Color(0xFF10A37F))) {
                        append(AetherOwnerTelegramUrl)
                    }
                    pop()
                    append(noticeText.substring(urlStart + AetherOwnerTelegramUrl.length))
                } else {
                    append(noticeText)
                }
            }
            Column {
                ClickableText(
                    text = annotatedText,
                    style = MaterialTheme.typography.bodyMedium.copy(color = AetherOnSurfaceVariant),
                    onClick = { offset ->
                        annotatedText
                            .getStringAnnotations(OwnerNoticeLinkTag, offset, offset)
                            .firstOrNull()
                            ?.let { openOwnerTelegram(context) }
                    },
                )
                Spacer(Modifier.height(8.dp))
                TextButton(onClick = { openOwnerTelegram(context) }) {
                    Text(stringResource(R.string.owner_notice_open))
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    prefs.edit().putBoolean(OwnerNoticeAcknowledgedKey, true).apply()
                    acknowledged = true
                    visible = false
                },
            ) {
                Text(stringResource(R.string.owner_notice_ok))
            }
        },
    )
}

private fun openOwnerTelegram(context: Context) {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(AetherOwnerTelegramUrl)).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    runCatching { context.startActivity(intent) }
}