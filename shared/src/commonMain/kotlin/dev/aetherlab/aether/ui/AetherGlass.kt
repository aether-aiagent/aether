package dev.aetherlab.aether.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.dp
import dev.aetherlab.aether.ui.theme.AetherOnSurface
import dev.aetherlab.aether.ui.theme.AetherSurface

/**
 * Стеклянная панель: полупрозрачная тонировка, верхний блик и волосяная обводка.
 * Ведёт себя как surface из Material 3, но читается как стекло поверх фона.
 */
@Composable
fun Modifier.aetherGlassPanel(
    shape: Shape,
    tint: Color = AetherSurface,
    tintAlpha: Float = 0.72f,
    borderColor: Color = AetherOnSurface,
    borderAlpha: Float = 0.16f,
    shadowElevation: Int = 20,
): Modifier {
    val tinted = tint.copy(alpha = tintAlpha)
    val sheen = Brush.linearGradient(
        colors = listOf(
            Color.White.copy(alpha = 0.09f),
            Color.White.copy(alpha = 0.02f),
            Color.Transparent,
        ),
        start = Offset(0f, 0f),
        end = Offset(0f, 420f),
    )
    val hairline = Brush.linearGradient(
        colors = listOf(
            borderColor.copy(alpha = borderAlpha * 1.9f),
            borderColor.copy(alpha = borderAlpha * 0.5f),
        ),
    )
    return this
        .shadow(
            elevation = shadowElevation.dp,
            shape = shape,
            clip = false,
            ambientColor = Color.Black.copy(alpha = 0.55f),
            spotColor = Color.Black.copy(alpha = 0.55f),
        )
        .clip(shape)
        .background(tinted)
        .background(sheen)
        .border(width = 1.dp, brush = hairline, shape = shape)
}