package dev.aetherlab.aether.platform

import dev.aetherlab.aether.data.AppLanguage
import java.util.Locale

actual fun platformAppVersion(): String = "Android"

actual fun applyPlatformAppLanguage(language: AppLanguage) {
    Locale.setDefault(Locale.forLanguageTag(language.languageTag))
}

