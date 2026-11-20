package dev.aetherlab.aether.ui

import dev.aetherlab.aether.data.SharedActiveSkillContext
import dev.aetherlab.aether.data.SharedInstalledSkill
import dev.aetherlab.aether.data.platformDynamicPromptValues

internal fun buildSharedPiAgentInstructions(
    configuredPrompt: String,
    workspaceDirectory: String,
    availableSkills: List<SharedInstalledSkill>,
    activeSkills: List<SharedActiveSkillContext>,
): String = buildString {
    expandSharedDynamicPromptPlaceholders(configuredPrompt).trim().takeIf(String::isNotBlank)?.let {
        append(it)
        append("\n\n")
    }
    append(
        "You are running inside Aether on iOS. Pi AI provides model and provider access, " +
            "Pi Agent Core runs the agent loop, and Pi Coding Agent owns tools, Skills, Extensions, sessions, retry, and compaction. " +
            "Use available tools instead of guessing about local state. " +
            "The default workspace for this chat is $workspaceDirectory. " +
            "User-uploaded files are under attachments/. Use read when inspection is needed; read returns image content for supported image files. " +
            "When linking a local file for the user to preview or share, use a Markdown link with a file:// target and the absolute path, " +
            "for example [report.pdf](file:///absolute/path/report.pdf). Do not use another URI scheme for local file links. " +
            "Only claim commands or actions that were actually performed."
    )
    append(
        "\n\nAnswer style: reply directly with the answer or perform the action. " +
            "Never open a message with rhetorical section labels such as 'Shortly:', 'In short:', 'Important:', 'Summary:', 'Note:' " +
            "or Russian equivalents ('Коротко:', 'Важно:', 'Итог:', 'В двух словах:'). " +
            "No preamble, no meta-commentary about being an AI, no restating the question. " +
            "If you cannot do something, say so in one sentence with the concrete reason and the single action the user must take, if any. " +
            "Prefer doing the task with tools over describing how it could be done. " +
            "Keep formatting minimal: short paragraphs; bullets only for genuine lists."
    )
    append(SharedPollPromptSection)
    append(SharedChartPromptSection)
    append(SharedSubagentBackgroundSection)
}

private val SharedDynamicPromptPlaceholderRegex = Regex("""\{\{\s*([A-Za-z0-9_-]+)\s*\}\}""")

internal fun expandSharedDynamicPromptPlaceholders(
    prompt: String,
    values: Map<String, String> = platformDynamicPromptValues(),
): String {
    if (!prompt.contains("{{")) return prompt
    return SharedDynamicPromptPlaceholderRegex.replace(prompt) { match ->
        values[match.groupValues[1].lowercase()] ?: match.value
    }
}
