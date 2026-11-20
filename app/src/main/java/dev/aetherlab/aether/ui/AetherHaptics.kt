package dev.aetherlab.aether.ui

import android.content.Context
import android.media.AudioAttributes
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext

/**
 * Small vocabulary of touch feedback, built on platform vibration primitives so it
 * feels the same as the rest of Android instead of like a one-off buzz.
 *
 * Every call is fire-and-forget and silently degrades to nothing on devices without a
 * vibrator, so callers never need to guard.
 */
enum class AetherHaptic {
    /** Light selection change: chips, rows, tabs. */
    Tick,

    /** Confirming a press: send, copy, accept. */
    Tap,

    /** Heavier acknowledgment: destructive confirm, long press. */
    Press,

    /** Completion: answer finished, tool succeeded. */
    Confirm,

    /** Failure or warning. */
    Warn,
}

class AetherHapticsController(
    private val vibrator: Vibrator?,
    private val enabled: Boolean = true,
) {
    private var lastPlayedAtMillis: Long = 0L

    fun perform(haptic: AetherHaptic) {
        if (!enabled) return
        val engine = vibrator ?: return
        if (!engine.hasVibrator()) return
        val now = System.currentTimeMillis()
        // Rapid repeats (fast scrolling) should not turn into a rumble.
        if (now - lastPlayedAtMillis < MinIntervalMillis && haptic == AetherHaptic.Tick) return
        lastPlayedAtMillis = now
        val effect = effectFor(haptic) ?: return
        runCatching {
            engine.vibrate(effect, AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_TOUCH)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build())
        }
    }

    private fun effectFor(haptic: AetherHaptic): VibrationEffect? = when (haptic) {
        AetherHaptic.Tick -> predefined(VibrationEffect.EFFECT_TICK, amplitude = 90)
        AetherHaptic.Tap -> predefined(VibrationEffect.EFFECT_CLICK, amplitude = 150)
        AetherHaptic.Press -> predefined(VibrationEffect.EFFECT_HEAVY_CLICK, amplitude = 220)
        AetherHaptic.Warn -> composite(
            VibrationEffect.Composition.PRIMITIVE_CLICK to 1f,
            VibrationEffect.Composition.PRIMITIVE_LOW_TICK to 0.6f,
        )
        AetherHaptic.Confirm -> composite(
            VibrationEffect.Composition.PRIMITIVE_CLICK to 1f,
            VibrationEffect.Composition.PRIMITIVE_TICK to 0.5f,
        )
    }

    private fun predefined(code: Int, amplitude: Int): VibrationEffect? = when {
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ->
            VibrationEffect.createPredefined(code)
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ->
            VibrationEffect.createOneShot(PredefinedFallbackMillis, amplitude)
        else -> null
    }

    private fun composite(vararg steps: Pair<Int, Float>): VibrationEffect? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            return predefined(VibrationEffect.EFFECT_CLICK, amplitude = 140)
        }
        val composition = VibrationEffect.startComposition()
        steps.forEachIndexed { index, (primitive, scale) ->
            if (index > 0) composition.addPrimitive(VibrationEffect.Composition.PRIMITIVE_TICK, 0.4f, StepDelayMillis)
            composition.addPrimitive(primitive, scale)
        }
        return composition.compose()
    }

    private companion object {
        const val MinIntervalMillis = 40L
        const val StepDelayMillis = 24
        const val PredefinedFallbackMillis = 14L
    }
}

@Composable
fun rememberAetherHaptics(enabled: Boolean = true): AetherHapticsController {
    val context = LocalContext.current
    return remember(context, enabled) {
        val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val manager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
            manager?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }
        AetherHapticsController(vibrator = vibrator, enabled = enabled)
    }
}

/** Non-composable access for callbacks that already hold an application context. */
fun aetherHaptics(context: Context, enabled: Boolean = true): AetherHapticsController {
    val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val manager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
        manager?.defaultVibrator
    } else {
        @Suppress("DEPRECATION")
        context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }
    return AetherHapticsController(vibrator = vibrator, enabled = enabled)
}