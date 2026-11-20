package dev.aetherlab.aether.ui

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext

/** How streamed text appears while the model is answering. */
enum class AetherTypingStyle {
    /** Letters fade in gently, a few at a time. */
    Smooth,

    /** Strict character-by-character typewriter. */
    Typewriter,

    /** No reveal animation, text lands at once. */
    Raw,
}

/** What a horizontal swipe on a chat row in the drawer does. */
enum class AetherSwipeAction {
    None,
    Export,
    Archive,
    Trash,
}

data class AetherChatFolder(
    val id: String,
    val name: String,
)

/**
 * Interface-level preferences that are purely local to the device: they never travel to the
 * model and do not need a settings migration, so they live in a small dedicated store.
 */
class AetherAppearancePrefs private constructor(context: Context) {
    private val prefs = context.applicationContext
        .getSharedPreferences(StoreName, Context.MODE_PRIVATE)

    var hapticsEnabled by mutableStateOf(prefs.getBoolean(KeyHapticsEnabled, true))
        private set
    var dynamicColor by mutableStateOf(prefs.getBoolean(KeyDynamicColor, false))
        private set
    var hapticStrength by mutableStateOf(prefs.getFloat(KeyHapticStrength, DefaultHapticStrength))
        private set
    var typingStyle by mutableStateOf(
        AetherTypingStyle.entries
            .firstOrNull { it.name == prefs.getString(KeyTypingStyle, null) }
            ?: AetherTypingStyle.Smooth,
    )
        private set
    var typingSpeedCps by mutableStateOf(prefs.getInt(KeyTypingSpeed, DefaultTypingSpeedCps))
        private set
    var swipeStartAction by mutableStateOf(readSwipe(KeySwipeStart, AetherSwipeAction.Export))
        private set
    var swipeEndAction by mutableStateOf(readSwipe(KeySwipeEnd, AetherSwipeAction.Trash))
        private set
    var folders by mutableStateOf(readFolders())
        private set
    var sessionFolders by mutableStateOf(readSessionFolders())
        private set
    var archivedSessionIds by mutableStateOf(readArchivedSessions())
        private set

    fun archiveSession(sessionId: String) {
        if (sessionId.isBlank() || sessionId in archivedSessionIds) return
        archivedSessionIds = archivedSessionIds + sessionId
        prefs.edit().putString(KeyArchivedSessions, archivedSessionsToJson(archivedSessionIds)).apply()
    }

    fun unarchiveSession(sessionId: String) {
        if (sessionId !in archivedSessionIds) return
        archivedSessionIds = archivedSessionIds - sessionId
        prefs.edit().putString(KeyArchivedSessions, archivedSessionsToJson(archivedSessionIds)).apply()
    }

    fun createFolder(name: String): AetherChatFolder? {
        val trimmed = name.trim()
        if (trimmed.isBlank()) return null
        val folder = AetherChatFolder(id = "f" + System.currentTimeMillis().toString(36), name = trimmed)
        val updated = folders + folder
        folders = updated
        prefs.edit().putString(KeyFolders, foldersToJson(updated)).apply()
        return folder
    }

    fun removeFolder(folderId: String) {
        folders = folders.filterNot { it.id == folderId }
        sessionFolders = sessionFolders.filterValues { it != folderId }
        prefs.edit()
            .putString(KeyFolders, foldersToJson(folders))
            .putString(KeySessionFolders, sessionFoldersToJson(sessionFolders))
            .apply()
    }

    fun assignSessionFolder(sessionId: String, folderId: String?) {
        val updated = if (folderId == null) {
            sessionFolders - sessionId
        } else {
            sessionFolders + (sessionId to folderId)
        }
        sessionFolders = updated
        prefs.edit().putString(KeySessionFolders, sessionFoldersToJson(updated)).apply()
    }

    fun updateHapticsEnabled(value: Boolean) {
        hapticsEnabled = value
        prefs.edit().putBoolean(KeyHapticsEnabled, value).apply()
    }

    fun updateDynamicColor(value: Boolean) {
        dynamicColor = value
        prefs.edit().putBoolean(KeyDynamicColor, value).apply()
    }

    fun updateHapticStrength(value: Float) {
        val clamped = value.coerceIn(MinHapticStrength, 1f)
        hapticStrength = clamped
        prefs.edit().putFloat(KeyHapticStrength, clamped).apply()
    }

    fun updateTypingStyle(style: AetherTypingStyle) {
        typingStyle = style
        prefs.edit().putString(KeyTypingStyle, style.name).apply()
    }

    fun updateTypingSpeedCps(value: Int) {
        val clamped = value.coerceIn(MinTypingSpeedCps, MaxTypingSpeedCps)
        typingSpeedCps = clamped
        prefs.edit().putInt(KeyTypingSpeed, clamped).apply()
    }

    fun updateSwipeStartAction(action: AetherSwipeAction) {
        swipeStartAction = action
        prefs.edit().putString(KeySwipeStart, action.name).apply()
    }

    fun updateSwipeEndAction(action: AetherSwipeAction) {
        swipeEndAction = action
        prefs.edit().putString(KeySwipeEnd, action.name).apply()
    }

    /** Characters revealed per animation tick, derived from the chosen style and speed. */
    fun typingChunkChars(): Int = when (typingStyle) {
        AetherTypingStyle.Raw -> Int.MAX_VALUE
        AetherTypingStyle.Smooth -> ((typingSpeedCps / 60f) * 2f).toInt().coerceAtLeast(2)
        AetherTypingStyle.Typewriter -> (typingSpeedCps / 60f).toInt().coerceAtLeast(1)
    }

    fun typingTickMillis(): Long = when (typingStyle) {
        AetherTypingStyle.Raw -> 0L
        AetherTypingStyle.Smooth -> 24L
        AetherTypingStyle.Typewriter -> 16L
    }

    private fun readSwipe(key: String, fallback: AetherSwipeAction): AetherSwipeAction =
        AetherSwipeAction.entries.firstOrNull { it.name == prefs.getString(key, null) } ?: fallback

    private fun readFolders(): List<AetherChatFolder> {
        val raw = prefs.getString(KeyFolders, null) ?: return emptyList()
        return runCatching {
            val array = org.json.JSONArray(raw)
            buildList {
                for (index in 0 until array.length()) {
                    val item = array.optJSONObject(index) ?: continue
                    val id = item.optString("id")
                    val name = item.optString("name")
                    if (id.isNotBlank() && name.isNotBlank()) {
                        add(AetherChatFolder(id = id, name = name))
                    }
                }
            }
        }.getOrDefault(emptyList())
    }

    private fun readArchivedSessions(): Set<String> {
        val raw = prefs.getString(KeyArchivedSessions, null) ?: return emptySet()
        return runCatching {
            val array = org.json.JSONArray(raw)
            buildSet {
                for (index in 0 until array.length()) {
                    val id = array.optString(index)
                    if (id.isNotBlank()) add(id)
                }
            }
        }.getOrDefault(emptySet())
    }

    private fun archivedSessionsToJson(value: Set<String>): String {
        val array = org.json.JSONArray()
        value.forEach { array.put(it) }
        return array.toString()
    }

    private fun readSessionFolders(): Map<String, String> {
        val raw = prefs.getString(KeySessionFolders, null) ?: return emptyMap()
        return runCatching {
            val json = org.json.JSONObject(raw)
            buildMap {
                json.keys().forEach { key ->
                    val value = json.optString(key)
                    if (value.isNotBlank()) put(key, value)
                }
            }
        }.getOrDefault(emptyMap())
    }

    private fun foldersToJson(value: List<AetherChatFolder>): String {
        val array = org.json.JSONArray()
        value.forEach { folder ->
            array.put(org.json.JSONObject().put("id", folder.id).put("name", folder.name))
        }
        return array.toString()
    }

    private fun sessionFoldersToJson(value: Map<String, String>): String {
        val json = org.json.JSONObject()
        value.forEach { (sessionId, folderId) -> json.put(sessionId, folderId) }
        return json.toString()
    }

    companion object {
        private const val StoreName = "aether_appearance"
        private const val KeyHapticsEnabled = "haptics_enabled"
        private const val KeyDynamicColor = "dynamic_color"
        private const val KeyHapticStrength = "haptic_strength"
        private const val KeyTypingStyle = "typing_style"
        private const val KeyTypingSpeed = "typing_speed_cps"
        private const val KeySwipeStart = "swipe_start_action"
        private const val KeySwipeEnd = "swipe_end_action"
        private const val KeyFolders = "chat_folders"
        private const val KeySessionFolders = "chat_session_folders"
        private const val KeyArchivedSessions = "chat_archived_sessions"

        const val DefaultHapticStrength = 0.85f
        const val MinHapticStrength = 0.15f
        const val DefaultTypingSpeedCps = 90
        const val MinTypingSpeedCps = 20
        const val MaxTypingSpeedCps = 240

        @Volatile
        private var instance: AetherAppearancePrefs? = null

        fun get(context: Context): AetherAppearancePrefs =
            instance ?: synchronized(this) {
                instance ?: AetherAppearancePrefs(context).also { instance = it }
            }
    }
}

@Composable
fun rememberAetherAppearance(): AetherAppearancePrefs {
    val context = LocalContext.current
    return remember(context) { AetherAppearancePrefs.get(context) }
}