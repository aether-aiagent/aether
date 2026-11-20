package dev.aetherlab.aether.ui.theme

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp

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
    backgroundGradientTop = Color(0xFFFAFBFF),
    settingsBackground = Color(0xFFF4F5F9),
    sidebarBackground = Color(0xFFF7F8FC),
    sidebarControl = Color(0xFFE9ECF5),
    settingsIcon = Color(0xFF4F5563),
    surface = Color(0xFFFFFFFF),
    surfaceHigh = Color(0xFFF4F5F9),
    surfaceHigher = Color(0xFFEDEFF6),
    surfaceVariant = Color(0xFFF4F5F9),
    outline = Color(0xFFE1E4ED),
    outlineSoft = Color(0xFFEBEDF4),
    onSurface = Color(0xFF12141A),
    onSurfaceVariant = Color(0xFF5A6070),
    primary = Color(0xFF2F55D4),
    onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFFD7E2FF),
    onPrimaryContainer = Color(0xFF0B1428),
    secondary = Color(0xFF4C5566),
    onSecondary = Color(0xFFFFFFFF),
    secondaryContainer = Color(0xFFE6E9F2),
    onSecondaryContainer = Color(0xFF12141A),
    tertiary = Color(0xFF0E9C7F),
    error = Color(0xFFC62F2F),
    messageBubble = Color(0xFFD7E2FF),
    scrim = Color(0x22050A18),
)

val DarkAetherPalette = AetherPalette(
    background = Color(0xFF1B1B22),
    backgroundGradientTop = Color(0xFF222230),
    settingsBackground = Color(0xFF16161B),
    sidebarBackground = Color(0xFF14141A),
    sidebarControl = Color(0xFF26262F),
    settingsIcon = Color(0xFFC3C6D4),
    surface = Color(0xFF1F1F27),
    surfaceHigh = Color(0xFF26262F),
    surfaceHigher = Color(0xFF30303B),
    surfaceVariant = Color(0xFF26262F),
    outline = Color(0xFF383843),
    outlineSoft = Color(0xFF2A2A34),
    onSurface = Color(0xFFECEDF3),
    onSurfaceVariant = Color(0xFF9EA3B4),
    primary = Color(0xFF6E8DFB),
    onPrimary = Color(0xFF08111F),
    primaryContainer = Color(0xFF3358C4),
    onPrimaryContainer = Color(0xFFF2F6FF),
    secondary = Color(0xFFB9C4E0),
    onSecondary = Color(0xFF08111F),
    secondaryContainer = Color(0xFF2E2E3A),
    onSecondaryContainer = Color(0xFFE6E8F0),
    tertiary = Color(0xFF36C7A4),
    error = Color(0xFFFF9C9C),
    messageBubble = Color(0xFF3358C4),
    scrim = Color(0x99000000),
)

val LightHighContrastAetherPalette = LightAetherPalette.copy(
    outline = Color(0xFF595959),
    outlineSoft = Color(0xFF767676),
    onSurface = Color(0xFF000000),
    onSurfaceVariant = Color(0xFF4A4A4A),
    primary = Color(0xFF000000),
    primaryContainer = Color(0xFFC7D6FF),
    onPrimaryContainer = Color(0xFF02060F),
    secondary = Color(0xFF3A4152),
    error = Color(0xFFA50E0E),
)

val DarkHighContrastAetherPalette = DarkAetherPalette.copy(
    outline = Color(0xFF8E8E8E),
    outlineSoft = Color(0xFF6E6E6E),
    onSurface = Color(0xFFFFFFFF),
    onSurfaceVariant = Color(0xFFE0E0E0),
    primary = Color(0xFF9DB7FF),
    primaryContainer = Color(0xFF3F63D8),
    onPrimaryContainer = Color(0xFFFFFFFF),
    secondary = Color(0xFFD6DCF0),
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

/**
 * Maps a Material You (system wallpaper) color scheme onto the Aether palette so that the
 * custom surfaces used across chats and settings follow the same accents as MaterialTheme.
 */
fun updateAetherPaletteFromScheme(scheme: androidx.compose.material3.ColorScheme) {
    val background = scheme.background
    val surface = scheme.surface
    val variant = scheme.surfaceVariant
    val dynamic = AetherPalette(
        background = background,
        backgroundGradientTop = lerp(background, surface, 0.35f),
        settingsBackground = lerp(background, variant, 0.65f),
        sidebarBackground = lerp(background, surface, 0.5f),
        sidebarControl = variant,
        settingsIcon = scheme.onSurfaceVariant,
        surface = surface,
        surfaceHigh = variant,
        surfaceHigher = lerp(variant, scheme.onSurface, 0.06f),
        surfaceVariant = variant,
        outline = scheme.outline,
        outlineSoft = scheme.outlineVariant,
        onSurface = scheme.onSurface,
        onSurfaceVariant = scheme.onSurfaceVariant,
        primary = scheme.primary,
        onPrimary = scheme.onPrimary,
        primaryContainer = scheme.primaryContainer,
        onPrimaryContainer = scheme.onPrimaryContainer,
        secondary = scheme.secondary,
        onSecondary = scheme.onSecondary,
        secondaryContainer = scheme.secondaryContainer,
        onSecondaryContainer = scheme.onSecondaryContainer,
        tertiary = scheme.tertiary,
        error = scheme.error,
        messageBubble = scheme.primaryContainer,
        scrim = scheme.scrim,
    )
    if (currentPalette != dynamic) {
        currentPalette = dynamic
    }
}
