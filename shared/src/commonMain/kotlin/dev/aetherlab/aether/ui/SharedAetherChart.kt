package dev.aetherlab.aether.ui

/**
 * Fence name the model uses to draw a chart inside the chat transcript.
 *
 * The fence body is JSON: `{"type": "line", "title": "...", "labels": [...], "series": [{"name": "...", "values": [...]}]}`
 */
const val AetherChartFenceName = "chart"

/**
 * System-prompt section that teaches the model the chart fence. Kept in shared code so Android
 * and iOS ship the same wording and the feature reads the same on both platforms.
 */
val SharedChartPromptSection: String =
    "\n\nWhen the answer is about numbers, trends or a comparison, draw a chart instead of a " +
        "markdown table. Emit a fenced code block tagged chart whose body is JSON, for example: " +
        "\n```chart\n" +
        "{\"type\":\"line\",\"title\":\"\$1,000 over 30 years at 7%\",\"labels\":[\"0\",\"10\",\"20\",\"30\"]," +
        "\"series\":[{\"name\":\"Compound\",\"values\":[1000,1967,3869,7612]},{\"name\":\"Simple\",\"values\":[1000,1700,2400,3100]}]}\n" +
        "```\n" +
        "Rules: \"type\" is line, bar or pie; \"values\" holds numbers only, without currency symbols " +
        "or thousands separators, and put the unit in the title or the series name; \"labels\" is " +
        "optional and may be shorter than the series; at most one chart per reply unless the user " +
        "asks for more; put nothing outside the JSON inside the fence."