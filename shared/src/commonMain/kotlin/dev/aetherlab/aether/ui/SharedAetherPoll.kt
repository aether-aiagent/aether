package dev.aetherlab.aether.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import dev.aetherlab.aether.shared.resources.Res
import dev.aetherlab.aether.shared.resources.poll_answered
import dev.aetherlab.aether.shared.resources.poll_custom_answer_hint
import dev.aetherlab.aether.shared.resources.poll_multiple_hint
import dev.aetherlab.aether.shared.resources.poll_reply_prefix
import dev.aetherlab.aether.shared.resources.poll_send_custom_answer
import dev.aetherlab.aether.shared.resources.poll_submit_answer
import dev.aetherlab.aether.shared.resources.poll_write_own_answer
import dev.aetherlab.aether.ui.theme.AetherOnSurface
import dev.aetherlab.aether.ui.theme.AetherOnSurfaceVariant
import dev.aetherlab.aether.ui.theme.AetherOutlineSoft
import dev.aetherlab.aether.ui.theme.AetherPrimary
import dev.aetherlab.aether.ui.theme.AetherSurface
import dev.aetherlab.aether.ui.theme.AetherSurfaceHigh
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import org.jetbrains.compose.resources.stringResource

/**
 * Fence name the model uses to render an interactive poll inside the chat transcript.
 *
 * The fence body is JSON:
 * `{"question": "...", "multiple": false, "options": [{"id": "a", "label": "..."}]}`
 */
const val AetherPollFenceName = "aether-poll"

/** Hard cap so a hostile or broken payload cannot build an unusable card. */
private const val AetherPollMaxOptions = 60

/**
 * System-prompt section that teaches the model the interactive poll fence. Kept here so Android
 * and iOS ship byte-identical wording and the feature behaves the same on both platforms.
 */
val SharedPollPromptSection: String =
    "\n\nWhen a question has a small set of clear, discrete answers, ask it as an interactive poll " +
        "instead of prose. Emit a fenced code block tagged poll whose body is JSON, for example: " +
        "\n```poll\n{\"question\": \"Which runtime should I use?\", \"options\": [\"Alpine\", \"Termux\"], \"multiple\": false}\n```\n" +
        "Rules: from 1 to 60 options, short option labels, \"multiple\" is optional and defaults to " +
        "false, put nothing else inside the fence, and keep asking at most one poll per reply. " +
        "The user can always answer in their own words, so never add an \"Other\" option."

val SharedSubagentBackgroundSection: String =
    "\n\nBackground-first delegation: when you launch a subagent (Agent tool), always pass " +
        "run_in_background: true unless the very next sentence depends on the subagent's result. " +
        "Never sit idle waiting for a running subagent — keep doing other useful work (more code, " +
        "more edits, more verification) and check results later with get_subagent_result. " +
        "Split large tasks into several smaller subagents running in parallel rather than one " +
        "long sequential run; the fan-out tool in the Lab Power extension does this automatically."

data class AetherPollOption(
    val id: String,
    val label: String,
)

data class AetherPoll(
    val question: String,
    val options: List<AetherPollOption>,
    val multiple: Boolean,
)

/**
 * Composer bridge used by the poll card: submitting an answer posts a normal chat message.
 * [prefillDraft] is kept for API compatibility with existing platform providers; the card itself
 * now collects free-form answers in an inline input and sends them via [submitAnswer].
 */
class AetherPollActions(
    val submitAnswer: (String) -> Unit,
    val prefillDraft: (String) -> Unit,
)

val LocalAetherPollActions = staticCompositionLocalOf<AetherPollActions?> { null }

/**
 * Lenient parser for a poll fence body.
 *
 * Returns `null` for anything that is not a usable poll, so callers can fall back to rendering the
 * fence as a regular code block instead of crashing.
 */
fun parseAetherPollPayload(raw: String): AetherPoll? {
    val trimmed = raw.trim()
    if (!trimmed.startsWith("{")) return null
    val root = runCatching { Json.parseToJsonElement(trimmed) }.getOrNull() as? JsonObject ?: return null
    val question = root.aetherPollString("question")?.trim().orEmpty()
    if (question.isEmpty()) return null
    val rawOptions = root["options"] as? JsonArray ?: return null
    val options = rawOptions.mapIndexedNotNull { index, element ->
        when (element) {
            is JsonPrimitive -> element.contentOrNull
                ?.trim()
                ?.takeIf { it.isNotEmpty() }
                ?.let { label -> AetherPollOption(id = "option-${index + 1}", label = label) }

            is JsonObject -> {
                val label = element.aetherPollString("label")?.trim().orEmpty()
                if (label.isEmpty()) {
                    null
                } else {
                    val id = element.aetherPollString("id")
                        ?.trim()
                        ?.takeIf { it.isNotEmpty() }
                        ?: "option-${index + 1}"
                    AetherPollOption(id = id, label = label)
                }
            }

            else -> null
        }
    }.take(AetherPollMaxOptions).distinctBy { option -> option.id }
    if (options.isEmpty()) return null
    return AetherPoll(
        question = question,
        options = options,
        multiple = root.aetherPollBoolean("multiple") ?: false,
    )
}

/**
 * Builds the chat message sent when the user submits a poll answer,
 * e.g. `Опрос: Which one? → First, Second`.
 *
 * When [customText] is non-blank it takes precedence over [selectedOptionIds] and is trimmed,
 * so a free-form answer typed inline in the card yields `Опрос: Which one? → my own words`.
 */
internal fun buildAetherPollAnswerReply(
    poll: AetherPoll,
    prefix: String,
    selectedOptionIds: Collection<String>,
    customText: String? = null,
): String {
    val header = "$prefix: ${poll.question}"
    val custom = customText?.trim().orEmpty()
    if (custom.isNotEmpty()) return "$header \u2192 $custom"
    val labels = poll.options
        .filter { option -> selectedOptionIds.contains(option.id) }
        .map { option -> option.label }
    if (labels.isEmpty()) return header
    return "$header \u2192 ${labels.joinToString(", ")}"
}

private fun JsonObject.aetherPollString(key: String): String? {
    val primitive = this[key] as? JsonPrimitive ?: return null
    return primitive.contentOrNull
}

private fun JsonObject.aetherPollBoolean(key: String): Boolean? {
    val primitive = this[key] as? JsonPrimitive ?: return null
    return primitive.booleanOrNull
}

internal fun aetherPollStateKey(messageKey: String?, poll: AetherPoll): String {
    val options = poll.options.joinToString(separator = ",") { option -> option.id }
    return "$messageKey|${poll.question}|$options"
}

/**
 * Interactive poll card rendered inside the chat transcript; identical on Android and iOS.
 *
 * Selection state lives in [rememberSaveable] keyed by the message id plus the option ids, so it
 * survives recomposition, process recreation and list recycling. Answering requires at least one
 * selected option; "write my own answer" opens an inline input directly below that button and the
 * answer is sent straight from the card.
 */
@Composable
fun AetherPollBlock(
    poll: AetherPoll,
    messageKey: String?,
) {
    val actions = LocalAetherPollActions.current
    val submitLabel = stringResource(Res.string.poll_submit_answer)
    val writeOwnLabel = stringResource(Res.string.poll_write_own_answer)
    val multipleHint = stringResource(Res.string.poll_multiple_hint)
    val answerPrefix = stringResource(Res.string.poll_reply_prefix)
    val answeredLabel = stringResource(Res.string.poll_answered)
    val customHint = stringResource(Res.string.poll_custom_answer_hint)
    val sendCustomLabel = stringResource(Res.string.poll_send_custom_answer)
    val saveKey = remember(messageKey, poll) { aetherPollStateKey(messageKey, poll) }
    var selectionRaw by rememberSaveable(saveKey) { mutableStateOf("") }
    var submittedReply by rememberSaveable(saveKey) { mutableStateOf("") }
    var customMode by rememberSaveable(saveKey) { mutableStateOf(false) }
    var customDraft by rememberSaveable(saveKey) { mutableStateOf("") }
    val selectedIndices = remember(selectionRaw, poll) { aetherPollSelectedIndices(selectionRaw, poll) }
    val selectedIds = remember(selectedIndices, poll) {
        selectedIndices.mapNotNull { index -> poll.options.getOrNull(index)?.id }.toSet()
    }
    val answered = submittedReply.isNotEmpty()
    val cardShape = RoundedCornerShape(18.dp)
    val optionShape = RoundedCornerShape(12.dp)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(cardShape)
            .background(AetherSurfaceHigh)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            text = poll.question,
            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
            color = AetherOnSurface,
        )
        if (poll.multiple) {
            Text(
                text = multipleHint,
                style = MaterialTheme.typography.bodySmall,
                color = AetherOnSurfaceVariant,
            )
        }
        Column(
            modifier = Modifier.fillMaxWidth().selectableGroup(),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            poll.options.forEachIndexed { index, option ->
                val selected = selectedIndices.contains(index)
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 48.dp)
                        .clip(optionShape)
                        .background(
                            if (selected) {
                                AetherPrimary.copy(alpha = 0.14f)
                            } else {
                                AetherSurface.copy(alpha = 0.55f)
                            }
                        )
                        .selectable(
                            selected = selected,
                            enabled = !answered,
                            role = if (poll.multiple) Role.Checkbox else Role.RadioButton,
                            onClick = {
                                val current = aetherPollSelectedIndices(selectionRaw, poll)
                                val next = when {
                                    !poll.multiple -> listOf(index)
                                    current.contains(index) -> current.filter { it != index }
                                    else -> (current + index).sorted()
                                }
                                selectionRaw = next.joinToString(",")
                            },
                        )
                        .semantics { contentDescription = option.label }
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    AetherPollSelectionIndicator(selected = selected, multiple = poll.multiple)
                    Text(
                        text = option.label,
                        style = MaterialTheme.typography.bodyMedium,
                        color = if (answered) AetherOnSurfaceVariant else AetherOnSurface,
                    )
                }
            }
        }
        if (answered) {
            Text(
                text = answeredLabel,
                style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
                color = AetherPrimary,
            )
            Text(
                text = submittedReply,
                style = MaterialTheme.typography.bodySmall,
                color = AetherOnSurfaceVariant,
            )
        } else {
            AetherPollActionButton(
                label = submitLabel,
                enabled = selectedIds.isNotEmpty() && actions != null,
                primary = true,
                onClick = {
                    val reply = buildAetherPollAnswerReply(
                        poll = poll,
                        prefix = answerPrefix,
                        selectedOptionIds = selectedIds,
                    )
                    submittedReply = reply
                    actions?.submitAnswer?.invoke(reply)
                },
            )
        }
        AetherPollActionButton(
            label = writeOwnLabel,
            enabled = !answered && actions != null,
            primary = false,
            onClick = { customMode = !customMode },
        )
        if (customMode && !answered) {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 48.dp)
                        .clip(optionShape)
                        .background(AetherSurface)
                        .border(width = 1.dp, color = AetherOutlineSoft, shape = optionShape)
                        .padding(horizontal = 12.dp, vertical = 12.dp),
                    contentAlignment = Alignment.CenterStart,
                ) {
                    if (customDraft.isEmpty()) {
                        Text(
                            text = customHint,
                            style = MaterialTheme.typography.bodyMedium,
                            color = AetherOnSurfaceVariant,
                        )
                    }
                    BasicTextField(
                        value = customDraft,
                        onValueChange = { customDraft = it },
                        singleLine = false,
                        textStyle = MaterialTheme.typography.bodyMedium.copy(color = AetherOnSurface),
                        cursorBrush = SolidColor(AetherPrimary),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                AetherPollActionButton(
                    label = sendCustomLabel,
                    enabled = customDraft.isNotBlank() && actions != null,
                    primary = true,
                    onClick = {
                        val reply = buildAetherPollAnswerReply(
                            poll = poll,
                            prefix = answerPrefix,
                            selectedOptionIds = emptyList(),
                            customText = customDraft,
                        )
                        submittedReply = reply
                        actions?.submitAnswer?.invoke(reply)
                        customMode = false
                        customDraft = ""
                    },
                )
            }
        }
    }
}

internal fun aetherPollSelectedIndices(raw: String, poll: AetherPoll): List<Int> = raw
    .split(',')
    .mapNotNull { index -> index.trim().toIntOrNull() }
    .filter { index -> index in poll.options.indices }
    .distinct()
    .sorted()

@Composable
private fun AetherPollSelectionIndicator(
    selected: Boolean,
    multiple: Boolean,
) {
    val shape = if (multiple) RoundedCornerShape(6.dp) else CircleShape
    Box(
        modifier = Modifier
            .size(22.dp)
            .clip(shape)
            .background(if (selected) AetherPrimary else Color.Transparent)
            .border(
                width = 1.5.dp,
                color = if (selected) AetherPrimary else AetherOutlineSoft,
                shape = shape,
            ),
        contentAlignment = Alignment.Center,
    ) {
        if (selected) {
            Text(
                text = "\u2713",
                style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold),
                color = Color.White,
            )
        }
    }
}

@Composable
private fun AetherPollActionButton(
    label: String,
    enabled: Boolean,
    primary: Boolean,
    onClick: () -> Unit,
) {
    val shape = RoundedCornerShape(12.dp)
    val outline = if (primary) {
        Modifier
    } else {
        Modifier.border(width = 1.dp, color = AetherOutlineSoft, shape = shape)
    }
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .clip(shape)
            .background(
                if (primary) {
                    AetherPrimary.copy(alpha = if (enabled) 0.16f else 0.06f)
                } else {
                    Color.Transparent
                }
            )
            .then(outline)
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelLarge,
            color = when {
                !enabled -> AetherOnSurfaceVariant.copy(alpha = 0.5f)
                primary -> AetherPrimary
                else -> AetherOnSurface
            },
            textAlign = TextAlign.Center,
        )
    }
}