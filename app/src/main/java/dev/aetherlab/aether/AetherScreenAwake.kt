package dev.aetherlab.aether

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * Keeps the display awake while a long agent run is in progress.
 *
 * This is a plain window flag (`FLAG_KEEP_SCREEN_ON`), so it needs no root, no
 * wake lock permission and no foreground service: the flag only lives as long as
 * the activity window is visible, and the OS releases it automatically when the
 * app goes to the background.
 *
 * The last choice is persisted so it survives a restart.
 */
object AetherScreenAwake {
    private const val PREFERENCES_NAME = "aether_screen_awake"
    private const val KEY_ENABLED = "keep_screen_on"

    private val _enabled = MutableStateFlow(false)
    val enabled: StateFlow<Boolean> = _enabled

    private fun preferences(context: Context) =
        context.applicationContext.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    fun restore(context: Context) {
        _enabled.value = preferences(context).getBoolean(KEY_ENABLED, false)
    }

    fun setEnabled(context: Context, enabled: Boolean) {
        preferences(context).edit().putBoolean(KEY_ENABLED, enabled).apply()
        _enabled.value = enabled
    }

    fun toggle(context: Context): Boolean {
        val next = !_enabled.value
        setEnabled(context, next)
        return next
    }
}