package dev.aetherlab.aether.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import kotlin.random.Random
import androidx.compose.ui.res.stringResource
import dev.aetherlab.aether.R
import java.util.Calendar

/** Greeting buckets by local hour, so the empty chat matches the time of day. */
private fun greetingPool(hourOfDay: Int): List<Int> = when (hourOfDay) {
    in 5..11 -> listOf(
        R.string.chat_greeting_morning_1,
        R.string.chat_greeting_morning_2,
        R.string.chat_greeting_morning_3,
    )
    in 12..17 -> listOf(
        R.string.chat_greeting_day_1,
        R.string.chat_greeting_day_2,
        R.string.chat_greeting_day_3,
    )
    in 18..22 -> listOf(
        R.string.chat_greeting_evening_1,
        R.string.chat_greeting_evening_2,
        R.string.chat_greeting_evening_3,
    )
    else -> listOf(
        R.string.chat_greeting_night_1,
        R.string.chat_greeting_night_2,
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
internal fun plainWelcomeLabel(): String = stringResource(R.string.chat_welcome_help)