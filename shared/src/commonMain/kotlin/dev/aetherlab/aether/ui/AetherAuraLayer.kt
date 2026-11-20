package dev.aetherlab.aether.ui

import androidx.compose.foundation.Canvas
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import dev.aetherlab.aether.ui.theme.AetherBackground
import dev.aetherlab.aether.ui.theme.AetherBackgroundGradientTop
import dev.aetherlab.aether.ui.theme.AetherSurface

/**
 * Подложка экрана: мягкие цветные пятна поверх затемнённого градиента.
 * Стеклянные панели читаются как стекло именно за счёт такого фона.
 */
@Composable
fun AetherAuraLayer(modifier: Modifier = Modifier) {
    val primary = MaterialTheme.colorScheme.primary
    val tertiary = MaterialTheme.colorScheme.tertiary
    val secondary = MaterialTheme.colorScheme.secondary
    val base = Brush.verticalGradient(
        colors = listOf(AetherBackgroundGradientTop, AetherBackground, AetherSurface),
    )
    Canvas(modifier = modifier) {
        drawRect(brush = base)
        val w = size.width
        val h = size.height
        val radius = h * 0.45f
        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(primary.copy(alpha = 0.30f), Color.Transparent),
                center = Offset(w * 0.12f, h * 0.06f),
                radius = radius,
            ),
            radius = radius,
            center = Offset(w * 0.12f, h * 0.06f),
        )
        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(tertiary.copy(alpha = 0.22f), Color.Transparent),
                center = Offset(w * 0.92f, h * 0.26f),
                radius = radius * 0.9f,
            ),
            radius = radius * 0.9f,
            center = Offset(w * 0.92f, h * 0.26f),
        )
        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(secondary.copy(alpha = 0.16f), Color.Transparent),
                center = Offset(w * 0.55f, h * 0.95f),
                radius = radius * 1.1f,
            ),
            radius = radius * 1.1f,
            center = Offset(w * 0.55f, h * 0.95f),
        )
        drawRect(
            brush = Brush.verticalGradient(
                0f to Color.Transparent,
                0.7f to Color.Transparent,
                1f to AetherBackground.copy(alpha = 0.55f),
            ),
        )
    }
}

/** Отступ под плавающие панели: держит сетку в тех же 12 dp, что и стекло на сайте. */
val AetherGlassGap = 12.dp