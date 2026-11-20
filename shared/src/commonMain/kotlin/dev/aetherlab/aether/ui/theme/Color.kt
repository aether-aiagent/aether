package dev.aetherlab.aether.ui.theme

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color

data class AetherPalette(
    val background: Color,
    val backgroundGradientTop: Color,
    val settingsBackground: Color,
    val sidebarBackground: Color,
    val sidebarControl: Color,
    val settingsIcon: Color,
    val surface: Color,
    val surfaceHigh: Color,
    val surfaceHigher: Color,
    val surfaceVariant: Color,
    val outline: Color,
    val outlineSoft: Color,
    val onSurface: Color,
    val onSurfaceVariant: Color,
    val primary: Color,
    val onPrimary: Color,
    val primaryContainer: Color,
    val onPrimaryContainer: Color,
    val secondary: Color,
    val onSecondary: Color,
    val secondaryContainer: Color,
    val onSecondaryContainer: Color,
    val tertiary: Color,
    val error: Color,
    val messageBubble: Color,
    val scrim: Color,
)

val LightAetherPalette = AetherPalette(
    background = Color(0xFFFFFFFF),
    backgroundGradientTop = Color(0xFFFFFFFF),
    settingsBackground = Color(0xFFF7F7F8),
    sidebarBackground = Color(0xFFF9F9F9),
    sidebarControl = Color(0xFFECECF1),
    settingsIcon = Color(0xFF5D5D5D),
    surface = Color(0xFFFFFFFF),
    surfaceHigh = Color(0xFFF7F7F8),
    surfaceHigher = Color(0xFFF4F4F4),
    surfaceVariant = Color(0xFFF4F4F4),
    outline = Color(0xFFE5E5E5),
    outlineSoft = Color(0xFFEDEDED),
    onSurface = Color(0xFF0D0D0D),
    onSurfaceVariant = Color(0xFF5D5D5D),
    primary = Color(0xFF0D0D0D),
    onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFFF0F0F0),
    onPrimaryContainer = Color(0xFF0D0D0D),
    secondary = Color(0xFF5D5D5D),
    onSecondary = Color(0xFFFFFFFF),
    secondaryContainer = Color(0xFFECECF1),
    onSecondaryContainer = Color(0xFF0D0D0D),
    tertiary = Color(0xFF10A37F),
    error = Color(0xFFD93025),
    messageBubble = Color(0xFFF4F4F4),
    scrim = Color(0x22000000),
)

val DarkAetherPalette = AetherPalette(
    background = Color(0xFF262626),
    backgroundGradientTop = Color(0xFF262626),
    settingsBackground = Color(0xFF1C1C1C),
    sidebarBackground = Color(0xFF1C1C1C),
    sidebarControl = Color(0xFF343434),
    settingsIcon = Color(0xFFB4B4B4),
    surface = Color(0xFF262626),
    surfaceHigh = Color(0xFF343434),
    surfaceHigher = Color(0xFF3D3D3D),
    surfaceVariant = Color(0xFF343434),
    outline = Color(0xFF434343),
    outlineSoft = Color(0xFF383838),
    onSurface = Color(0xFFECECEC),
    onSurfaceVariant = Color(0xFFB4B4B4),
    primary = Color(0xFFFFFFFF),
    onPrimary = Color(0xFF0D0D0D),
    primaryContainer = Color(0xFF343434),
    onPrimaryContainer = Color(0xFFECECEC),
    secondary = Color(0xFFB4B4B4),
    onSecondary = Color(0xFF0D0D0D),
    secondaryContainer = Color(0xFF343434),
    onSecondaryContainer = Color(0xFFECECEC),
    tertiary = Color(0xFF10A37F),
    error = Color(0xFFF28B82),
    messageBubble = Color(0xFF343434),
    scrim = Color(0x66000000),
)

val LightHighContrastAetherPalette = LightAetherPalette.copy(
    outline = Color(0xFF595959),
    outlineSoft = Color(0xFF767676),
    onSurface = Color(0xFF000000),
    onSurfaceVariant = Color(0xFF4A4A4A),
    primary = Color(0xFF000000),
    primaryContainer = Color(0xFFE5E5E5),
    onPrimaryContainer = Color(0xFF000000),
    secondary = Color(0xFF4A4A4A),
    error = Color(0xFFA50E0E),
)

val DarkHighContrastAetherPalette = DarkAetherPalette.copy(
    outline = Color(0xFF8E8E8E),
    outlineSoft = Color(0xFF6E6E6E),
    onSurface = Color(0xFFFFFFFF),
    onSurfaceVariant = Color(0xFFE0E0E0),
    primary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFF3D3D3D),
    onPrimaryContainer = Color(0xFFFFFFFF),
    secondary = Color(0xFFE0E0E0),
    error = Color(0xFFFFB4AB),
)

private var currentPalette by mutableStateOf(LightAetherPalette)

fun updateAetherPalette(darkTheme: Boolean, increasedContrast: Boolean = false) {
    val palette = when {
        darkTheme && increasedContrast -> DarkHighContrastAetherPalette
        darkTheme -> DarkAetherPalette
        increasedContrast -> LightHighContrastAetherPalette
        else -> LightAetherPalette
    }
    if (currentPalette != palette) {
        currentPalette = palette
    }
}

val AetherBackground: Color
    get() = currentPalette.background

val AetherBackgroundGradientTop: Color
    get() = currentPalette.backgroundGradientTop

val AetherSettingsBackground: Color
    get() = currentPalette.settingsBackground

val AetherSidebarBackground: Color
    get() = currentPalette.sidebarBackground

val AetherSidebarControl: Color
    get() = currentPalette.sidebarControl

val AetherSettingsIcon: Color
    get() = currentPalette.settingsIcon

val AetherSurface: Color
    get() = currentPalette.surface

val AetherSurfaceHigh: Color
    get() = currentPalette.surfaceHigh

val AetherSurfaceHigher: Color
    get() = currentPalette.surfaceHigher

val AetherSurfaceVariant: Color
    get() = currentPalette.surfaceVariant

val AetherOutline: Color
    get() = currentPalette.outline

val AetherOutlineSoft: Color
    get() = currentPalette.outlineSoft

val AetherOnSurface: Color
    get() = currentPalette.onSurface

val AetherOnSurfaceVariant: Color
    get() = currentPalette.onSurfaceVariant

val AetherPrimary: Color
    get() = currentPalette.primary

val AetherOnPrimary: Color
    get() = currentPalette.onPrimary

val AetherPrimaryContainer: Color
    get() = currentPalette.primaryContainer

val AetherOnPrimaryContainer: Color
    get() = currentPalette.onPrimaryContainer

val AetherSecondary: Color
    get() = currentPalette.secondary

val AetherOnSecondary: Color
    get() = currentPalette.onSecondary

val AetherSecondaryContainer: Color
    get() = currentPalette.secondaryContainer

val AetherOnSecondaryContainer: Color
    get() = currentPalette.onSecondaryContainer

val AetherTertiary: Color
    get() = currentPalette.tertiary

val AetherError: Color
    get() = currentPalette.error

val AetherMessageBubble: Color
    get() = currentPalette.messageBubble

val AetherScrim: Color
    get() = currentPalette.scrim
