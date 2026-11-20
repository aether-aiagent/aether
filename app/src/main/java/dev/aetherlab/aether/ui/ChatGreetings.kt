package dev.aetherlab.aether.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import dev.aetherlab.aether.shared.resources.Res
import dev.aetherlab.aether.shared.resources.chat_greeting_day_1
import dev.aetherlab.aether.shared.resources.chat_greeting_day_2
import dev.aetherlab.aether.shared.resources.chat_greeting_day_3
import dev.aetherlab.aether.shared.resources.chat_greeting_evening_1
import dev.aetherlab.aether.shared.resources.chat_greeting_evening_2
import dev.aetherlab.aether.shared.resources.chat_greeting_evening_3
import dev.aetherlab.aether.shared.resources.chat_greeting_morning_1
import dev.aetherlab.aether.shared.resources.chat_greeting_morning_2
import dev.aetherlab.aether.shared.resources.chat_greeting_morning_3
import dev.aetherlab.aether.shared.resources.chat_greeting_night_1
import dev.aetherlab.aether.shared.resources.chat_greeting_night_2
import dev.aetherlab.aether.shared.resources.chat_welcome_help
import kotlin.random.Random
import org.jetbrains.compose.resources.StringResource
import org.jetbrains.compose.resources.stringResource
import java.util.Calendar

/** Greeting buckets by local hour, so the empty chat matches the time of day. */
private fun greetingPool(hourOfDay: Int): List<StringResource> = when (hourOfDay) {
    in 5..11 -> listOf(
        Res.string.chat_greeting_morning_1,
        Res.string.chat_greeting_morning_2,
        Res.string.chat_greeting_morning_3,
    )
    in 12..17 -> listOf(
        Res.string.chat_greeting_day_1,
        Res.string.chat_greeting_day_2,
        Res.string.chat_greeting_day_3,
    )
    in 18..22 -> listOf(
        Res.string.chat_greeting_evening_1,
        Res.string.chat_greeting_evening_2,
        Res.string.chat_greeting_evening_3,
    )
    else -> listOf(
        Res.string.chat_greeting_night_1,
        Res.string.chat_greeting_night_2,
    )
}

/**
 * The headline of the empty chat screen.
 *
 * [seed] keeps the chosen variant stable while the screen recomposes; callers that
 * want a fresh phrase after sending a message can pass a new seed.
 */
@Composable
internal fun chatGreeting(seed: Int = 0): String {
    val hour = remember { Calendar.getInstance().get(Calendar.HOUR_OF_DAY) }
    val pool = remember(hour) { greetingPool(hour) }
    val index = remember(hour, seed) { Random(seed * 31 + hour).nextInt(pool.size) }
    return stringResource(pool[index])
}

/** Fallback used when the caller only has the plain welcome string. */
@Composable
internal fun plainWelcomeLabel(): String = stringResource(Res.string.chat_welcome_help)