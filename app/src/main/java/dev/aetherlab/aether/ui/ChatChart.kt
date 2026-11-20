package dev.aetherlab.aether.ui

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.BarChart
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.KeyboardArrowUp
import androidx.compose.material.icons.rounded.PieChart
import androidx.compose.material.icons.rounded.ShowChart
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.aetherlab.aether.ui.theme.AetherOnSurface
import dev.aetherlab.aether.ui.theme.AetherOnSurfaceVariant
import dev.aetherlab.aether.ui.theme.AetherOutlineSoft
import dev.aetherlab.aether.ui.theme.AetherSurfaceHigh
import org.json.JSONObject

/**
 * Charts drawn straight inside a reply.
 *
 * The model emits a ```chart fence whose body is JSON (or a plain key/value block), and the
 * message renders as a collapsible card with the plotted series and a legend, so numbers stay
 * readable instead of turning into a wall of table rows.
 */
internal enum class ChatChartKind { Line, Bar, Pie }

internal data class ChatChartSeries(
    val name: String,
    val values: List<Float>,
)

internal data class ChatChartSpec(
    val kind: ChatChartKind,
    val title: String,
    val labels: List<String>,
    val series: List<ChatChartSeries>,
)

internal const val ChatChartFenceName = "chart"

private val chartPalette = listOf(
    Color(0xFF7FA6F2),
    Color(0xFF4FC3A1),
    Color(0xFFE0A458),
    Color(0xFFB58CE8),
    Color(0xFFE3796F),
    Color(0xFF5FC0D8),
    Color(0xFFC3CE6B),
    Color(0xFFE287B4),
)

internal fun parseChatChartPayload(raw: String): ChatChartSpec? {
    val trimmed = raw.trim()
    if (trimmed.isEmpty()) return null
    if (trimmed.startsWith("{")) {
        val fromJson = runCatching { chartFromJson(JSONObject(trimmed)) }.getOrNull()
        if (fromJson != null) return fromJson
    }
    return chartFromKeyValue(trimmed)
}

private fun chartKindOf(value: String): ChatChartKind = when (value.trim().lowercase()) {
    "bar", "bars", "column", "columns", "histogram" -> ChatChartKind.Bar
    "pie", "donut", "doughnut" -> ChatChartKind.Pie
    else -> ChatChartKind.Line
}

private fun readNumbers(array: org.json.JSONArray?): List<Float>? {
    if (array == null) return null
    val values = ArrayList<Float>(array.length())
    for (index in 0 until array.length()) {
        val raw = array.opt(index)
        val number = when (raw) {
            is Number -> raw.toFloat()
            is String -> raw.trim().replace(",", "").replace("%", "").toFloatOrNull()
            else -> null
        } ?: return null
        values += number
    }
    return values.takeIf { it.isNotEmpty() }
}

private fun chartFromJson(root: JSONObject): ChatChartSpec? {
    val kind = chartKindOf(root.optString("type").ifBlank { root.optString("kind") })
    val title = root.optString("title").ifBlank { root.optString("name") }
    val labels = mutableListOf<String>()
    val labelsArray = root.optJSONArray("labels") ?: root.optJSONArray("x")
    if (labelsArray != null) {
        for (index in 0 until labelsArray.length()) {
            labels += labelsArray.optString(index).ifBlank { index.toString() }
        }
    }
    val series = mutableListOf<ChatChartSeries>()
    val seriesArray = root.optJSONArray("series") ?: root.optJSONArray("datasets")
    if (seriesArray != null) {
        for (index in 0 until seriesArray.length()) {
            val entry = seriesArray.optJSONObject(index) ?: continue
            val values = readNumbers(entry.optJSONArray("values") ?: entry.optJSONArray("data")) ?: continue
            series += ChatChartSeries(
                name = entry.optString("name").ifBlank { "Series ${index + 1}" },
                values = values,
            )
        }
    } else {
        val values = readNumbers(root.optJSONArray("values") ?: root.optJSONArray("data"))
        if (values != null) {
            series += ChatChartSeries(root.optString("name").ifBlank { "Value" }, values)
        }
    }
    if (series.isEmpty()) return null
    return ChatChartSpec(kind = kind, title = title, labels = labels, series = series)
}

private fun chartFromKeyValue(raw: String): ChatChartSpec? {
    var kind = ChatChartKind.Line
    var title = ""
    val labels = mutableListOf<String>()
    val series = mutableListOf<ChatChartSeries>()
    for (line in raw.lines()) {
        val trimmed = line.trim().trimEnd(',')
        if (trimmed.isEmpty()) continue
        val separator = trimmed.indexOf(':')
        if (separator <= 0) continue
        val key = trimmed.substring(0, separator).trim().trim('"', '\'')
        val value = trimmed.substring(separator + 1).trim().trim('"', '\'', '[', ']')
        when (key.lowercase()) {
            "type", "kind", "chart" -> kind = chartKindOf(value)
            "title" -> title = value
            "labels", "x" -> labels += value.split(',', ';', '|').map { it.trim().trim('"', '\'') }
            else -> {
                val values = value.split(',', ';', '|').mapNotNull { it.trim().toFloatOrNull() }
                if (values.isNotEmpty()) series += ChatChartSeries(key, values)
            }
        }
    }
    if (series.isEmpty()) return null
    return ChatChartSpec(kind = kind, title = title, labels = labels, series = series)
}

@Composable
internal fun ChatChartBlock(spec: ChatChartSpec) {
    var expanded by remember(spec) { mutableStateOf(true) }
    val heading = spec.title.ifBlank { "Chart" }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(AetherSurfaceHigh)
            .animateContentSize()
            .padding(horizontal = 14.dp, vertical = 12.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { expanded = !expanded },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = when (spec.kind) {
                    ChatChartKind.Line -> Icons.Rounded.ShowChart
                    ChatChartKind.Bar -> Icons.Rounded.BarChart
                    ChatChartKind.Pie -> Icons.Rounded.PieChart
                },
                contentDescription = null,
                tint = AetherOnSurfaceVariant,
                modifier = Modifier.size(18.dp),
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = heading,
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Medium),
                color = AetherOnSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Icon(
                imageVector = if (expanded) Icons.Rounded.KeyboardArrowUp else Icons.Rounded.KeyboardArrowDown,
                contentDescription = null,
                tint = AetherOnSurfaceVariant,
                modifier = Modifier.size(20.dp),
            )
        }
        if (expanded) {
            Spacer(modifier = Modifier.height(10.dp))
            when (spec.kind) {
                ChatChartKind.Pie -> ChatChartPie(spec)
                else -> ChatChartPlot(spec)
            }
            if (spec.series.size > 1 || spec.kind == ChatChartKind.Pie) {
                Spacer(modifier = Modifier.height(10.dp))
                ChatChartLegend(spec)
            }
            if (spec.labels.isNotEmpty()) {
                Spacer(modifier = Modifier.height(6.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        text = spec.labels.first(),
                        style = MaterialTheme.typography.labelSmall,
                        color = AetherOnSurfaceVariant,
                    )
                    if (spec.labels.size > 2) {
                        Text(
                            text = spec.labels[spec.labels.size / 2],
                            style = MaterialTheme.typography.labelSmall,
                            color = AetherOnSurfaceVariant,
                        )
                    }
                    if (spec.labels.size > 1) {
                        Text(
                            text = spec.labels.last(),
                            style = MaterialTheme.typography.labelSmall,
                            color = AetherOnSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ChatChartPlot(spec: ChatChartSpec) {
    val gridColor = AetherOutlineSoft
    val barMode = spec.kind == ChatChartKind.Bar
    Canvas(
        modifier = Modifier
            .fillMaxWidth()
            .height(180.dp),
    ) {
        val allValues = spec.series.flatMap { it.values }
        if (allValues.isEmpty()) return@Canvas
        val rawMax = allValues.maxOrNull() ?: 1f
        val rawMin = allValues.minOrNull() ?: 0f
        val top = if (rawMax <= 0f) 1f else rawMax * 1.08f
        val bottom = if (rawMin < 0f) rawMin * 1.08f else 0f
        val span = (top - bottom).takeIf { it > 0f } ?: 1f
        val padding = 6.dp.toPx()

        for (step in 0..3) {
            val y = padding + (size.height - padding * 2f) * step / 3f
            drawLine(
                color = gridColor,
                start = Offset(0f, y),
                end = Offset(size.width, y),
                strokeWidth = 1f,
            )
        }

        fun yFor(value: Float): Float =
            padding + (size.height - padding * 2f) * (1f - (value - bottom) / span)

        fun xFor(index: Int, count: Int): Float =
            if (count <= 1) size.width / 2f else size.width * index / (count - 1).toFloat()

        if (barMode) {
            val count = spec.series.maxOf { it.values.size }
            val slot = size.width / count.coerceAtLeast(1)
            val seriesCount = spec.series.size.coerceAtLeast(1)
            val barWidth = (slot * 0.68f / seriesCount).coerceAtLeast(1f)
            spec.series.forEachIndexed { seriesIndex, series ->
                val color = chartPalette[seriesIndex % chartPalette.size]
                series.values.forEachIndexed { index, value ->
                    val left = slot * index + slot * 0.16f + barWidth * seriesIndex
                    val y = yFor(value)
                    val zero = yFor(0f)
                    drawRoundRect(
                        color = color,
                        topLeft = Offset(left, minOf(y, zero)),
                        size = Size(barWidth * 0.86f, kotlin.math.abs(zero - y).coerceAtLeast(1f)),
                        cornerRadius = androidx.compose.ui.geometry.CornerRadius(4.dp.toPx()),
                    )
                }
            }
        } else {
            spec.series.forEachIndexed { seriesIndex, series ->
                val color = chartPalette[seriesIndex % chartPalette.size]
                var previous: Offset? = null
                series.values.forEachIndexed { index, value ->
                    val point = Offset(xFor(index, series.values.size), yFor(value))
                    previous?.let { start ->
                        drawLine(
                            color = color,
                            start = start,
                            end = point,
                            strokeWidth = 2.5.dp.toPx(),
                            cap = StrokeCap.Round,
                        )
                    }
                    drawCircle(color = color, radius = 2.5.dp.toPx(), center = point)
                    previous = point
                }
            }
        }
    }
}

@Composable
private fun ChatChartPie(spec: ChatChartSpec) {
    val slices = spec.series.firstOrNull()?.values ?: return
    val total = slices.sum().takeIf { it > 0f } ?: return
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(180.dp),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(modifier = Modifier.size(150.dp)) {
            var startAngle = -90f
            slices.forEachIndexed { index, value ->
                val sweep = 360f * value / total
                drawArc(
                    color = chartPalette[index % chartPalette.size],
                    startAngle = startAngle,
                    sweepAngle = sweep.coerceAtLeast(0.4f),
                    useCenter = true,
                )
                startAngle += sweep
            }
            drawCircle(
                color = AetherSurfaceHigh,
                radius = size.minDimension * 0.3f,
            )
        }
    }
}

@Composable
private fun ChatChartLegend(spec: ChatChartSpec) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        val names = when (spec.kind) {
            ChatChartKind.Pie -> spec.series.firstOrNull()?.values?.indices?.map { index ->
                spec.labels.getOrNull(index) ?: "Item ${index + 1}"
            } ?: emptyList()

            else -> spec.series.map { it.name }
        }
        names.forEachIndexed { index, name ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(chartPalette[index % chartPalette.size]),
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = name,
                    style = MaterialTheme.typography.labelSmall,
                    color = AetherOnSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}