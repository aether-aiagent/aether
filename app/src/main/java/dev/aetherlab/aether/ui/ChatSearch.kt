package dev.aetherlab.aether.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import dev.aetherlab.aether.ui.theme.AetherOnSurfaceVariant
import dev.aetherlab.aether.ui.theme.AetherTertiary

/**
 * Full-text search over the chat list: titles first, then message bodies, because the thing you
 * remember about an old chat is usually a sentence you wrote, not its title.
 */
internal fun chatMatchesQuery(session: ChatSession, query: String): Boolean {
    val needle = query.trim()
    if (needle.isEmpty()) return true
    if (session.title.contains(needle, ignoreCase = true)) return true
    if (session.preview.contains(needle, ignoreCase = true)) return true
    return session.messages.any { message -> message.text.contains(needle, ignoreCase = true) }
}

/** The first place the query appears inside a message, trimmed to a readable window. */
internal fun chatSearchSnippet(
    session: ChatSession,
    query: String,
    maxChars: Int = 110,
): String? {
    val needle = query.trim()
    if (needle.isEmpty()) return null
    if (session.title.contains(needle, ignoreCase = true)) return null
    val hit = session.messages.firstOrNull { message ->
        message.author == MessageAuthor.User && message.text.contains(needle, ignoreCase = true)
    } ?: session.messages.firstOrNull { message -> message.text.contains(needle, ignoreCase = true) }
        ?: return null
    val flat = flattenSnippetSource(hit.text)
    val index = flat.indexOf(needle, ignoreCase = true).coerceAtLeast(0)
    if (flat.length <= maxChars) return flat
    val start = (index - maxChars / 3).coerceIn(0, (flat.length - maxChars).coerceAtLeast(0))
    val slice = flat.substring(start, (start + maxChars).coerceAtMost(flat.length)).trim()
    val prefix = if (start > 0) "…" else ""
    val suffix = if (start + maxChars < flat.length) "…" else ""
    return prefix + slice + suffix
}

private fun flattenSnippetSource(text: String): String = text
    .replace("\r\n", "\n")
    .replace('\n', ' ')
    .replace("```", " ")
    .replace(Regex("\\s+"), " ")
    .trim()

/** Draws a snippet with the matched query emphasised, so long rows stay scannable. */
@Composable
internal fun SearchSnippetText(
    text: String,
    query: String,
    modifier: Modifier = Modifier,
    style: TextStyle = MaterialTheme.typography.bodySmall,
    color: androidx.compose.ui.graphics.Color = AetherOnSurfaceVariant,
    highlightColor: androidx.compose.ui.graphics.Color = AetherTertiary,
) {
    Text(
        text = highlightMatches(text, query, highlightColor),
        style = style,
        color = color,
        maxLines = 2,
        overflow = TextOverflow.Ellipsis,
        modifier = modifier,
    )
}

private fun highlightMatches(
    text: String,
    query: String,
    highlightColor: androidx.compose.ui.graphics.Color,
): AnnotatedString {
    val needle = query.trim()
    if (needle.isEmpty()) return AnnotatedString(text)
    val builder = buildAnnotatedString {
        var cursor = 0
        while (cursor < text.length) {
            val index = text.indexOf(needle, cursor, ignoreCase = true)
            if (index < 0) {
                append(text.substring(cursor))
                break
            }
            if (index > cursor) append(text.substring(cursor, index))
            withStyle(SpanStyle(color = highlightColor, fontWeight = FontWeight.SemiBold)) {
                append(text.substring(index, index + needle.length))
            }
            cursor = index + needle.length
        }
    }
    return builder
}