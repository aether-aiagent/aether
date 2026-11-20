package dev.aetherlab.aether.ui

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.Code
import androidx.compose.material.icons.rounded.FolderOpen
import androidx.compose.material.icons.rounded.PhoneAndroid
import androidx.compose.material.icons.rounded.Terminal
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import dev.aetherlab.aether.ui.theme.AetherBackground
import dev.aetherlab.aether.ui.theme.AetherOnPrimary
import dev.aetherlab.aether.ui.theme.AetherOnSurface
import dev.aetherlab.aether.ui.theme.AetherOnSurfaceVariant
import dev.aetherlab.aether.ui.theme.AetherOutlineSoft
import dev.aetherlab.aether.ui.theme.AetherPrimary
import dev.aetherlab.aether.ui.theme.AetherPrimaryContainer
import dev.aetherlab.aether.ui.theme.AetherSurfaceHigh
import dev.aetherlab.aether.ui.theme.AetherTertiary
import dev.aetherlab.aether.shared.resources.Res
import dev.aetherlab.aether.shared.resources.abilities_body
import dev.aetherlab.aether.shared.resources.abilities_title
import dev.aetherlab.aether.shared.resources.ability_files_body
import dev.aetherlab.aether.shared.resources.ability_files_title
import dev.aetherlab.aether.shared.resources.ability_screen_body
import dev.aetherlab.aether.shared.resources.ability_screen_title
import dev.aetherlab.aether.shared.resources.ability_skills_body
import dev.aetherlab.aether.shared.resources.ability_skills_title
import dev.aetherlab.aether.shared.resources.ability_terminal_body
import dev.aetherlab.aether.shared.resources.ability_terminal_title
import dev.aetherlab.aether.shared.resources.close_label
import dev.aetherlab.aether.shared.resources.goal_ask
import dev.aetherlab.aether.shared.resources.goal_automation
import dev.aetherlab.aether.shared.resources.goal_code
import dev.aetherlab.aether.shared.resources.goal_reminders
import dev.aetherlab.aether.shared.resources.goal_screen
import dev.aetherlab.aether.shared.resources.goal_voice
import dev.aetherlab.aether.shared.resources.goals_body
import dev.aetherlab.aether.shared.resources.goals_title
import dev.aetherlab.aether.shared.resources.onboarding_continue
import org.jetbrains.compose.resources.StringResource
import org.jetbrains.compose.resources.stringResource
import kotlin.math.cos
import kotlin.math.sin

/** Goal identifiers used by the onboarding survey; the value is what lands in the prompt. */
internal object OnboardingGoal {
    const val Ask = "ask"
    const val Code = "code"
    const val Screen = "screen"
    const val Reminders = "reminders"
    const val Voice = "voice"
    const val Automation = "automation"

    val ordered = listOf(Ask, Code, Screen, Reminders, Voice, Automation)

    fun label(goal: String): StringResource = when (goal) {
        Ask -> Res.string.goal_ask
        Code -> Res.string.goal_code
        Screen -> Res.string.goal_screen
        Reminders -> Res.string.goal_reminders
        Voice -> Res.string.goal_voice
        else -> Res.string.goal_automation
    }
}

/**
 * Slow drifting aurora drawn behind the tour pages. Pure Canvas work, so it costs
 * nothing to animate and looks alive without any asset.
 */
@Composable
internal fun TourAuroraBackdrop(modifier: Modifier = Modifier) {
    val transition = rememberInfiniteTransition(label = "tour_aurora")
    val phase by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 18_000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "tour_aurora_phase",
    )
    Canvas(modifier = modifier.fillMaxSize()) {
        val orbs = listOf(
            Triple(AetherPrimary.copy(alpha = 0.20f), 0.62f, 0.18f),
            Triple(AetherPrimaryContainer.copy(alpha = 0.16f), 0.34f, 0.56f),
            Triple(AetherTertiary.copy(alpha = 0.10f), 0.52f, 0.86f),
        )
        orbs.forEachIndexed { index, (color, radiusFraction, baseYFraction) ->
            val angle = phase * 2f * Math.PI.toFloat() + index * 2.1f
            val center = Offset(
                x = size.width * (0.5f + 0.34f * cos(angle)),
                y = size.height * (baseYFraction + 0.06f * sin(angle * 1.3f)),
            )
            val radius = size.minDimension * radiusFraction
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(color, Color.Transparent),
                    center = center,
                    radius = radius,
                ),
                radius = radius,
                center = center,
            )
        }
    }
}

@Composable
private fun TourPageFrame(
    stepIndex: Int,
    stepCount: Int,
    onBack: (() -> Unit)?,
    onSkip: (() -> Unit)?,
    skipLabel: StringResource,
    content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(AetherBackground),
    ) {
        TourAuroraBackdrop()
        Column(
            modifier = Modifier
                .fillMaxSize()
                .navigationBarsPadding(),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .statusBarsPadding()
                    .padding(horizontal = 16.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (onBack != null) {
                    IconButton(onClick = onBack, modifier = Modifier.size(40.dp)) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Rounded.ArrowBack,
                            contentDescription = null,
                            tint = AetherOnSurface,
                        )
                    }
                } else {
                    Spacer(modifier = Modifier.size(40.dp))
                }
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    repeat(stepCount) { index ->
                        Box(
                            modifier = Modifier
                                .width(if (index + 1 == stepIndex) 20.dp else 7.dp)
                                .height(7.dp)
                                .clip(RoundedCornerShape(999.dp))
                                .background(
                                    if (index + 1 == stepIndex) AetherOnSurface else AetherOutlineSoft,
                                ),
                        )
                    }
                }
                if (onSkip != null) {
                    TextButton(onClick = onSkip) {
                        Text(text = stringResource(skipLabel), color = AetherOnSurfaceVariant)
                    }
                } else {
                    Spacer(modifier = Modifier.size(40.dp))
                }
            }
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(start = 24.dp, top = 8.dp, end = 24.dp, bottom = 24.dp),
                content = content,
            )
        }
    }
}

@Composable
private fun AbilityRow(icon: ImageVector, title: String, body: String, accent: Color) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(AetherSurfaceHigh.copy(alpha = 0.72f))
            .padding(horizontal = 14.dp, vertical = 14.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(
            modifier = Modifier
                .size(38.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(accent.copy(alpha = 0.16f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(imageVector = icon, contentDescription = null, tint = accent, modifier = Modifier.size(20.dp))
        }
        Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = AetherOnSurface,
            )
            Text(
                text = body,
                style = MaterialTheme.typography.bodySmall,
                color = AetherOnSurfaceVariant,
            )
        }
    }
}

@Composable
internal fun OnboardingAbilitiesStep(
    stepIndex: Int,
    stepCount: Int,
    replayMode: Boolean,
    onBack: () -> Unit,
    onContinue: () -> Unit,
    onSkip: () -> Unit,
) {
    TourPageFrame(
        stepIndex = stepIndex,
        stepCount = stepCount,
        onBack = onBack,
        onSkip = if (replayMode) null else onSkip,
        skipLabel = if (replayMode) Res.string.close_label else Res.string.skip_label,
    ) {
        Spacer(modifier = Modifier.height(12.dp))
        Text(
            text = stringResource(Res.string.abilities_title),
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.SemiBold,
            color = AetherOnSurface,
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = stringResource(Res.string.abilities_body),
            style = MaterialTheme.typography.bodyMedium,
            color = AetherOnSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(20.dp))
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            AbilityRow(
                icon = Icons.Rounded.Terminal,
                title = stringResource(Res.string.ability_terminal_title),
                body = stringResource(Res.string.ability_terminal_body),
                accent = AetherPrimary,
            )
            AbilityRow(
                icon = Icons.Rounded.FolderOpen,
                title = stringResource(Res.string.ability_files_title),
                body = stringResource(Res.string.ability_files_body),
                accent = AetherTertiary,
            )
            AbilityRow(
                icon = Icons.Rounded.PhoneAndroid,
                title = stringResource(Res.string.ability_screen_title),
                body = stringResource(Res.string.ability_screen_body),
                accent = AetherPrimaryContainer,
            )
            AbilityRow(
                icon = Icons.Rounded.AutoAwesome,
                title = stringResource(Res.string.ability_skills_title),
                body = stringResource(Res.string.ability_skills_body),
                accent = AetherPrimary,
            )
        }
        Spacer(modifier = Modifier.height(20.dp))
        Button(
            onClick = onContinue,
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp),
            shape = RoundedCornerShape(16.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = AetherPrimary,
                contentColor = AetherOnPrimary,
            ),
        ) {
            Text(
                text = stringResource(Res.string.onboarding_continue),
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

@Composable
internal fun OnboardingGoalsStep(
    stepIndex: Int,
    stepCount: Int,
    replayMode: Boolean,
    selectedGoals: Set<String>,
    onToggleGoal: (String) -> Unit,
    onBack: () -> Unit,
    onContinue: () -> Unit,
    onSkip: () -> Unit,
) {
    TourPageFrame(
        stepIndex = stepIndex,
        stepCount = stepCount,
        onBack = onBack,
        onSkip = if (replayMode) null else onSkip,
        skipLabel = if (replayMode) Res.string.close_label else Res.string.skip_label,
    ) {
        Spacer(modifier = Modifier.height(12.dp))
        Text(
            text = stringResource(Res.string.goals_title),
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.SemiBold,
            color = AetherOnSurface,
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = stringResource(Res.string.goals_body),
            style = MaterialTheme.typography.bodyMedium,
            color = AetherOnSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(20.dp))
        OnboardingGoal.ordered.chunked(2).forEach { row ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                row.forEach { goal ->
                    val selected = selectedGoals.contains(goal)
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .height(64.dp)
                            .clip(RoundedCornerShape(18.dp))
                            .background(
                                if (selected) AetherPrimaryContainer else AetherSurfaceHigh.copy(alpha = 0.72f),
                            )
                            .clickable { onToggleGoal(goal) },
                        contentAlignment = Alignment.CenterStart,
                    ) {
                        Text(
                            text = stringResource(OnboardingGoal.label(goal)),
                            style = MaterialTheme.typography.bodyMedium,
                            color = if (selected) AetherOnPrimary else AetherOnSurface,
                            modifier = Modifier.padding(horizontal = 14.dp),
                        )
                    }
                }
                if (row.size == 1) {
                    Spacer(modifier = Modifier.weight(1f))
                }
            }
        }
        Spacer(modifier = Modifier.height(12.dp))
        Button(
            onClick = onContinue,
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp),
            shape = RoundedCornerShape(16.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = AetherPrimary,
                contentColor = AetherOnPrimary,
            ),
        ) {
            Text(
                text = stringResource(Res.string.onboarding_continue),
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}