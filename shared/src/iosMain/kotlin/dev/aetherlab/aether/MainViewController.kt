package dev.aetherlab.aether

import androidx.compose.ui.window.ComposeUIViewController
import androidx.compose.ui.uikit.OnFocusBehavior
import dev.aetherlab.aether.platform.currentPlatformCapabilities
import dev.aetherlab.aether.runtime.IosAlpineRuntime
import dev.aetherlab.aether.runtime.NativeRuntimeHost
import dev.aetherlab.aether.ui.IosComposeApp
import dev.aetherlab.aether.data.createIosAetherSettingsStore
import dev.aetherlab.aether.data.createIosAetherChatHistoryDatabase
import dev.aetherlab.aether.platform.IosPlatformServices
import dev.aetherlab.aether.platform.IosNativeSettingsHost

fun MainViewController(runtimeHost: NativeRuntimeHost): platform.UIKit.UIViewController {
    val runtime = IosAlpineRuntime(runtimeHost)
    val settingsStore = createIosAetherSettingsStore()
    val chatHistoryDatabase = createIosAetherChatHistoryDatabase()
    val platformServices = IosPlatformServices(runtimeHost)
    return ComposeUIViewController(configure = {
        // Chat handles IME insets locally; never pan the entire iPad split layout.
        onFocusBehavior = OnFocusBehavior.DoNothing
    }) {
        IosComposeApp(
            runtime = runtime,
            capabilities = currentPlatformCapabilities,
            settingsStore = settingsStore,
            chatHistoryDatabase = chatHistoryDatabase,
            platformServices = platformServices,
            nativeSettingsHost = IosNativeSettingsHost,
        )
    }
}
