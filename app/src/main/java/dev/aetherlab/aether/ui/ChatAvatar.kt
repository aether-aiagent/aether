package dev.aetherlab.aether.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/**
 * Per-chat identity: a stable colour, glyph and corner shape derived from the chat id.
 *
 * Nothing is persisted, so every chat keeps its look across restarts, renames and
 * syncs without a database migration, and new chats get their own identity for free.
 */
internal data class ChatAvatarStyle(
    val color: Color,
    val glyph: String,
    val cornerFactor: Float,
)

private val chatAvatarColors = listOf(
    Color(0xFF3F6FD8),
    Color(0xFF2E9E7E),
    Color(0xFFB4762A),
    Color(0xFF8A5BD6),
    Color(0xFFC0453F),
    Color(0xFF2F8FA8),
    Color(0xFF7A8B3C),
    Color(0xFFB4517F),
    Color(0xFF5566C9),
    Color(0xFF3E7A4E),
    Color(0xFFA0642C),
    Color(0xFF6E5AA8),
)

private val chatAvatarGlyphs = listOf(
    "✦", "◆", "●", "▲", "✳", "❖", "✚", "⬢", "◐", "◈", "✧", "⬟",
)

private val chatAvatarCorners = listOf(0.5f, 0.34f, 0.24f, 0.16f)

internal fun chatAvatarStyle(seed: String): ChatAvatarStyle {
    var hash = 7
    for (character in seed) {
        hash = hash * 31 + character.code
    }
    val spread = ((hash % 10_007) + 10_007) % 10_007
    return ChatAvatarStyle(
        color = chatAvatarColors[spread % chatAvatarColors.size],
        glyph = chatAvatarGlyphs[(spread / 7) % chatAvatarGlyphs.size],
        cornerFactor = chatAvatarCorners[(spread / 13) % chatAvatarCorners.size],
    )
}

@Composable
internal fun ChatAvatarBadge(
    seed: String,
    sizeDp: Int = 44,
    modifier: Modifier = Modifier,
) {
    val style = chatAvatarStyle(seed)
    Box(
        modifier = modifier
            .size(sizeDp.dp)
            .clip(RoundedCornerShape((sizeDp * style.cornerFactor).dp))
            .background(style.color),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = style.glyph,
            color = Color.White,
            fontSize = (sizeDp * 0.42f).sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

internal enum class ChatDateBucket { Today, Yesterday, Earlier }

private const val DayMillis = 24L * 60L * 60L * 1000L

internal fun chatDateBucket(millis: Long, nowMillis: Long = System.currentTimeMillis()): ChatDateBucket {
    val today = Calendar.getInstance().apply { timeInMillis = nowMillis }
    today.set(Calendar.HOUR_OF_DAY, 0)
    today.set(Calendar.MINUTE, 0)
    today.set(Calendar.SECOND, 0)
    today.set(Calendar.MILLISECOND, 0)
    val startOfToday = today.timeInMillis
    return when {
        millis >= startOfToday -> ChatDateBucket.Today
        millis >= startOfToday - DayMillis -> ChatDateBucket.Yesterday
        else -> ChatDateBucket.Earlier
    }
}

/** Sessions bucketed into Today / Yesterday / Earlier, each bucket keeping the list order. */
internal fun groupSessionsByDate(
    sessions: List<ChatSession>,
    nowMillis: Long = System.currentTimeMillis(),
): List<Pair<ChatDateBucket, List<ChatSession>>> {
    val buckets = linkedMapOf<ChatDateBucket, MutableList<ChatSession>>()
    for (session in sessions) {
        val stamp = session.lastMessageAtMillis ?: 0L
        val bucket = if (stamp <= 0L) ChatDateBucket.Earlier else chatDateBucket(stamp, nowMillis)
        buckets.getOrPut(bucket) { mutableListOf() }.add(session)
    }
    return buckets.map { (bucket, items) -> bucket to items.toList() }
}

/** Clock time for today, short date for anything older; empty when the chat has no messages. */
internal fun chatTimestampLabel(millis: Long?): String {
    if (millis == null || millis <= 0L) return ""
    val now = Calendar.getInstance()
    val then = Calendar.getInstance().apply { timeInMillis = millis }
    val sameDay = now.get(Calendar.YEAR) == then.get(Calendar.YEAR) &&
        now.get(Calendar.DAY_OF_YEAR) == then.get(Calendar.DAY_OF_YEAR)
    val pattern = if (sameDay) "HH:mm" else "d MMM"
    return SimpleDateFormat(pattern, Locale.getDefault()).format(Date(millis))
}
