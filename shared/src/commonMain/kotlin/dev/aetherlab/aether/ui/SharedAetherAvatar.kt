package dev.aetherlab.aether.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** Base size used by callers that want the default avatar. */
val AetherAgentAvatarSize = 24.dp

/**
 * The agent's own round mark: a blue gradient disc with a four-point spark.
 *
 * It is drawn in code so it stays sharp at every size (24 dp in a message row,
 * 64 dp on the empty state) and needs no bitmap assets to ship.
 */
@Composable
fun AetherAgentAvatar(
    size: Dp = AetherAgentAvatarSize,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .size(size)
            .clip(CircleShape)
            .background(
                Brush.linearGradient(
                    colors = listOf(Color(0xFF8AA3FF), Color(0xFF3F62D6), Color(0xFF2C46A8)),
                )
            ),
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val radius = this.size.minDimension / 2f * 0.46f
            val cx = this.size.width / 2f
            val cy = this.size.height / 2f
            val inner = radius * 0.22f
            val spark = Path().apply {
                moveTo(cx, cy - radius)
                quadraticBezierTo(cx + inner, cy - inner, cx + radius, cy)
                quadraticBezierTo(cx + inner, cy + inner, cx, cy + radius)
                quadraticBezierTo(cx - inner, cy + inner, cx - radius, cy)
                quadraticBezierTo(cx - inner, cy - inner, cx, cy - radius)
                close()
            }
            drawPath(path = spark, color = Color.White.copy(alpha = 0.94f))
        }
    }
}