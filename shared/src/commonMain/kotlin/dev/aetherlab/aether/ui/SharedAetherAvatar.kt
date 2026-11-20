package dev.aetherlab.aether.ui

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin
import kotlin.random.Random

/** Base size used by callers that want the default avatar. */
val AetherAgentAvatarSize = 24.dp

private const val AvatarMorphHoldMillis = 2_600L
private const val AvatarBlinkMillis = 110L

/** Body silhouettes the avatar morphs between; same sample count keeps interpolation trivial. */
private enum class BotSilhouette(val roundness: Float, val lobes: Int, val lobeDepth: Float) {
    Rounded(roundness = 0.34f, lobes = 0, lobeDepth = 0f),
    Squircle(roundness = 0.26f, lobes = 0, lobeDepth = 0f),
    Puffy(roundness = 0.30f, lobes = 4, lobeDepth = 0.05f),
    Bun(roundness = 0.40f, lobes = 6, lobeDepth = 0.04f),
    Pea(roundness = 0.18f, lobes = 3, lobeDepth = 0.06f),
    ;

    companion object {
        fun at(index: Int): BotSilhouette = entries[index.mod(entries.size)]
    }
}

private fun silhouetteSample(shape: BotSilhouette, fraction: Float): Float {
    // Start from a superellipse-ish radius so the head reads like a soft squircle.
    val angle = fraction * 2f * PI.toFloat()
    val superellipse = run {
        val n = 2f + (1f - shape.roundness) * 5f
        val c = kotlin.math.abs(cos(angle))
        val s = kotlin.math.abs(sin(angle))
        val denominator = (c.pow(n) + s.pow(n)).pow(1f / n)
        if (denominator <= 0f) 1f else 1f / denominator
    }
    val lobes = if (shape.lobes == 0) 0f else shape.lobeDepth * cos(shape.lobes * angle)
    return superellipse + lobes
}

private const val SilhouetteSamples = 48

private fun buildBodyPath(
    shape: BotSilhouette,
    previous: BotSilhouette,
    progress: Float,
    center: Offset,
    radius: Float,
    rotation: Float,
): androidx.compose.ui.graphics.Path {
    val path = androidx.compose.ui.graphics.Path()
    val loop = SilhouetteSamples
    for (index in 0 until loop) {
        val fraction = index.toFloat() / loop
        val current = silhouetteSample(shape, fraction)
        val before = silhouetteSample(previous, fraction)
        val r = radius * (before + (current - before) * progress)
        val angle = fraction * 2f * PI.toFloat() + rotation
        val point = Offset(center.x + cos(angle) * r, center.y + sin(angle) * r)
        if (index == 0) path.moveTo(point.x, point.y) else path.lineTo(point.x, point.y)
    }
    path.close()
    return path
}

/**
 * The agent's face: a soft rounded head, two eyes that blink and wander, and a body
 * that slowly changes silhouette. Everything is drawn on a single Canvas, so it stays
 * crisp from 20 dp in a message row up to 72 dp in the empty state and needs no assets.
 *
 * Set [animated] to false for dense lists; the face is then drawn at rest.
 */
@Composable
fun AetherAgentAvatar(
    size: Dp = AetherAgentAvatarSize,
    modifier: Modifier = Modifier,
    animated: Boolean = true,
    working: Boolean = false,
    listeningLevel: Float = 0f,
) {
    val seed = remember { Random.nextInt(0, 1_000) }
    var silhouetteIndex by remember { mutableIntStateOf(BotSilhouette.entries.indexOf(BotSilhouette.Rounded)) }
    val morphProgress by animateFloatAsState(
        targetValue = silhouetteIndex.toFloat(),
        animationSpec = spring(dampingRatio = 0.72f, stiffness = 42f),
        label = "bot_morph",
    )
    var blink by remember { mutableStateOf(false) }
    var gaze by remember { mutableStateOf(Offset.Zero) }

    if (animated) {
        LaunchedEffect(working) {
            var next = silhouetteIndex
            while (true) {
                delay(AvatarMorphHoldMillis + Random.nextLong(0, 1_400) + if (working) -1_200 else 0L)
                next += 1
                silhouetteIndex = next
            }
        }
        LaunchedEffect(animated) {
            while (true) {
                delay(1_900L + Random.nextLong(0, 2_600))
                blink = true
                delay(AvatarBlinkMillis)
                blink = false
                if (Random.nextInt(100) < 22) {
                    // Occasional double blink, the way people actually blink.
                    delay(90L)
                    blink = true
                    delay(AvatarBlinkMillis)
                    blink = false
                }
            }
        }
        LaunchedEffect(animated) {
            while (true) {
                delay(1_400L + Random.nextLong(0, 3_200))
                gaze = Offset(
                    x = Random.nextFloat() * 2f - 1f,
                    y = Random.nextFloat() * 1.2f - 0.6f,
                )
            }
        }
    }

    // Only animated instances pay for the breathing clock.
    val breathe = if (animated) breathingPhase(working) else 0f

    Box(
        modifier = modifier
            .size(size)
            .clip(CircleShape)
            .background(
                Brush.linearGradient(
                    colors = listOf(Color(0xFFCBD6FF), Color(0xFFAFBDF5), Color(0xFF98A8EE)),
                ),
            ),
    ) {
        val gazeAnimated = animateOffset(gaze)
        Canvas(modifier = Modifier.fillMaxSize()) {
            val center = Offset(this.size.width / 2f, this.size.height / 2f)
            val baseRadius = this.size.minDimension * 0.34f
            val swell = 1f + listeningLevel.coerceIn(0f, 1f) * 0.10f + breathe * 0.015f
            val radius = baseRadius * swell
            val index = morphProgress.toInt()
            val shape = BotSilhouette.at(index)
            val previous = BotSilhouette.at(index - 1)
            val rotation = (morphProgress - morphProgress.toInt()) * 0.18f + seed * 0.01f

            drawHead(
                shape = shape,
                previous = previous,
                progress = (morphProgress - index).coerceIn(0f, 1f),
                center = center,
                radius = radius,
                rotation = rotation,
                working = working,
            )
            drawEyes(
                center = center,
                radius = radius,
                gaze = gazeAnimated.value,
                blink = blink,
                working = working,
            )
        }
    }
}

private fun DrawScope.drawHead(
    shape: BotSilhouette,
    previous: BotSilhouette,
    progress: Float,
    center: Offset,
    radius: Float,
    rotation: Float,
    working: Boolean,
) {
    val path = buildBodyPath(
        shape = shape,
        previous = previous,
        progress = progress,
        center = center,
        radius = radius,
        rotation = rotation,
    )
    drawPath(
        path = path,
        brush = Brush.linearGradient(
            colors = listOf(
                Color(0xFF232B44),
                Color(0xFF141A2C),
            ),
            start = Offset(center.x - radius, center.y - radius),
            end = Offset(center.x + radius, center.y + radius),
        ),
    )
    if (working) {
        drawPath(
            path = path,
            color = Color(0xFFC3D2FF).copy(alpha = 0.55f),
            style = Stroke(width = radius * 0.10f),
        )
    }
}

private fun DrawScope.drawEyes(
    center: Offset,
    radius: Float,
    gaze: Offset,
    blink: Boolean,
    working: Boolean,
) {
    val eyeRadius = radius * 0.19f
    val spread = radius * 0.42f
    val offset = Offset(gaze.x * radius * 0.16f, gaze.y * radius * 0.14f)
    val ink = Color(0xFFE9EFFF)
    listOf(-1f, 1f).forEach { side ->
        val eyeCenter = Offset(center.x + side * spread + offset.x, center.y + offset.y)
        if (blink) {
            drawLine(
                color = ink,
                start = Offset(eyeCenter.x - eyeRadius, eyeCenter.y),
                end = Offset(eyeCenter.x + eyeRadius, eyeCenter.y),
                strokeWidth = eyeRadius * 0.5f,
            )
        } else {
            val height = eyeRadius * if (working) 2.4f else 2f
            drawOval(
                color = ink,
                topLeft = Offset(eyeCenter.x - eyeRadius * 0.78f, eyeCenter.y - height / 2f),
                size = Size(eyeRadius * 1.56f, height),
            )
        }
    }
}

@Composable
private fun breathingPhase(working: Boolean): Float {
    val transition = rememberInfiniteTransition(label = "bot_breathe")
    val value by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = if (working) 2_600 else 5_200, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "bot_breathe_value",
    )
    return value
}

/** Smoothed gaze offset so eye darts read as blinks of attention, not jumps. */
@Composable
private fun animateOffset(target: Offset): androidx.compose.animation.core.Animatable<Offset, androidx.compose.animation.core.AnimationVector2D> {
    val animatable = remember { androidx.compose.animation.core.Animatable(Offset.Zero, Offset.VectorConverter) }
    LaunchedEffect(target) {
        animatable.animateTo(
            targetValue = target,
            animationSpec = spring(dampingRatio = 0.55f, stiffness = 90f),
        )
    }
    return animatable
}