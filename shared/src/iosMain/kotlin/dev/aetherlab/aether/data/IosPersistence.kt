package dev.aetherlab.aether.data

import dev.aetherlab.aether.data.chatdb.ChatHistoryDatabase
import dev.aetherlab.aether.data.chatdb.createIosChatHistoryDatabase
import platform.Foundation.NSHomeDirectory
import platform.Foundation.NSFileManager
import kotlinx.cinterop.ExperimentalForeignApi

@OptIn(ExperimentalForeignApi::class)
private fun iosApplicationSupportDirectory(): String {
    val path = NSHomeDirectory() + "/Library/Application Support"
    NSFileManager.defaultManager.createDirectoryAtPath(
        path = path,
        withIntermediateDirectories = true,
        attributes = null,
        error = null,
    )
    return path
}

fun createIosAetherSettingsStore(): AetherSettingsStore =
    createAetherSettingsStore(
        iosApplicationSupportDirectory() + "/aether_settings.preferences_pb",
    )

fun createIosAetherChatHistoryDatabase(): ChatHistoryDatabase =
    createIosChatHistoryDatabase(
        iosApplicationSupportDirectory() + "/aether_chat_history.db",
    )
