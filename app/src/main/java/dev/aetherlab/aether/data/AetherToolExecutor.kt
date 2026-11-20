package dev.aetherlab.aether.data

import dev.aetherlab.aether.runtime.RuntimeRouter
import dev.aetherlab.aether.runtime.RuntimeShellTool
import org.json.JSONArray
import org.json.JSONObject

data class AetherToolExecutionResult(
    val toolName: String,
    val argumentsJson: String,
    val rawOutput: String,
    val visibleOutput: String = AetherToolExecutor.sanitizeToolOutputForConversation(toolName, rawOutput),
) {
    val isError: Boolean = !AetherToolExecutor.inferToolOutputOk(visibleOutput)
}

/**
 * Adapter for Aether-owned host capabilities only. Pi Coding Agent owns all
 * filesystem, shell, search, Skill, Extension, and image-reading mechanics.
 */
class AetherToolExecutor(
    private val runtimeRouter: RuntimeRouter,
    private val agentModeController: AgentModeController? = null,
    private val deviceRootController: DeviceRootController? = null,
    private val runtimeShellTool: RuntimeShellTool? = null,
) {
    suspend fun execute(
        settings: AppSettings,
        workspaceDirectory: String,
        termuxWorkspaceDirectory: String,
        toolName: String,
        argumentsJson: String,
        selfManagementTool: AetherSelfManagementTool? = null,
        agentModeEnabled: Boolean = false,
        currentRuntimeId: LocalRuntimeId = settings.defaultRuntimeId ?: LocalRuntimeId.Alpine,
        onRuntimeChanged: suspend (LocalRuntimeId) -> Unit = {},
        onProgress: (suspend (String) -> Unit)? = null,
    ): AetherToolExecutionResult {
        val rawOutput = when (toolName) {
            DeviceControlToolName -> executeDeviceControl(argumentsJson)

            "agent_display" -> if (agentModeEnabled) {
                agentModeController?.execute(
                    settings = settings,
                    workspaceDirectory = workspaceDirectory,
                    termuxWorkspaceDirectory = termuxWorkspaceDirectory,
                    argumentsJson = argumentsJson,
                ) ?: unavailableToolOutput(toolName)
            } else {
                JSONObject()
                    .put("ok", false)
                    .put("errmsg", "Agent Mode is not enabled for this chat.")
                    .toString()
            }

            "aether_runtime_manage" -> executeRuntimeManage(
                settings = settings,
                currentRuntimeId = currentRuntimeId,
                workspaceDirectory = workspaceDirectory,
                termuxWorkspaceDirectory = termuxWorkspaceDirectory,
                argumentsJson = argumentsJson,
                onRuntimeChanged = onRuntimeChanged,
            )

            in SelfManagementToolNames -> selfManagementTool?.execute(
                toolName = toolName,
                argumentsJson = argumentsJson,
            ) ?: unavailableToolOutput(toolName)

            DeviceRootToolName -> deviceRootController?.executeTool(
                settings = settings,
                argumentsJson = argumentsJson,
            ) ?: unavailableToolOutput(toolName)

            RuntimeRunToolName -> runtimeShellTool?.execute(
                settings = settings,
                argumentsJson = argumentsJson,
                onProgress = onProgress,
            ) ?: unavailableToolOutput(toolName)

            RuntimeCheckToolName -> runtimeShellTool?.fetch(
                settings = settings,
                argumentsJson = argumentsJson,
            ) ?: unavailableToolOutput(toolName)

            RuntimeKillToolName -> runtimeShellTool?.kill(
                settings = settings,
                argumentsJson = argumentsJson,
            ) ?: unavailableToolOutput(toolName)

            else -> JSONObject()
                .put("ok", false)
                .put("error", "Unknown Aether host tool '$toolName'.")
                .toString()
        }
        return AetherToolExecutionResult(toolName, argumentsJson, rawOutput)
    }

    private suspend fun executeRuntimeManage(
        settings: AppSettings,
        currentRuntimeId: LocalRuntimeId,
        workspaceDirectory: String,
        termuxWorkspaceDirectory: String,
        argumentsJson: String,
        onRuntimeChanged: suspend (LocalRuntimeId) -> Unit,
    ): String {
        val arguments = runCatching { JSONObject(argumentsJson) }.getOrNull()
            ?: return JSONObject().put("ok", false).put("errmsg", "Invalid JSON arguments.").toString()
        val action = arguments.optString("action").trim()
        if (action == "status") {
            val states = LocalRuntimeId.entries.associateWith { runtimeId ->
                runtimeRouter.runtimeById(runtimeId).inspectSetup()
            }
            return JSONObject().apply {
                put("ok", true)
                put("action", "status")
                put("runtime", currentRuntimeId.storageValue)
                put("cwd", runtimeCwd(currentRuntimeId, workspaceDirectory, termuxWorkspaceDirectory))
                put(
                    "available",
                    JSONObject().apply {
                        states.forEach { (runtimeId, state) -> put(runtimeId.storageValue, state.isReady) }
                    },
                )
            }.toString()
        }
        if (action != "set") {
            return JSONObject().put("ok", false).put("errmsg", "action must be 'status' or 'set'.").toString()
        }
        val requested = LocalRuntimeId.fromStorage(arguments.optString("runtime"))
            ?: return JSONObject().put("ok", false).put("errmsg", "runtime must be 'alpine' or 'termux'.").toString()
        val setup = runtimeRouter.runtimeById(requested).inspectSetup()
        val enabled = settings.enabledRuntimeIds.isEmpty() || requested in settings.enabledRuntimeIds
        if (!setup.isReady || !enabled) {
            return JSONObject().apply {
                put("ok", false)
                put("errmsg", "${requested.displayName} runtime is unavailable.")
                put("detail", setup.detail)
                put("runtime", currentRuntimeId.storageValue)
                put("cwd", runtimeCwd(currentRuntimeId, workspaceDirectory, termuxWorkspaceDirectory))
            }.toString()
        }
        onRuntimeChanged(requested)
        return JSONObject().apply {
            put("ok", true)
            put("action", "set")
            put("runtime", requested.storageValue)
            put("cwd", runtimeCwd(requested, workspaceDirectory, termuxWorkspaceDirectory))
        }.toString()
    }

    companion object {
        val hostToolNames: Set<String> = setOf(
            "agent_display",
            DeviceControlToolName,
            DeviceRootToolName,
            RuntimeRunToolName,
            RuntimeCheckToolName,
            RuntimeKillToolName,
            *SelfManagementToolNames.toTypedArray(),
        )

        fun supports(toolName: String): Boolean = toolName in hostToolNames

        fun hostToolDefinitions(
            selfManagementTool: AetherSelfManagementTool? = null,
            agentModeEnabled: Boolean = false,
            rootAccessEnabled: Boolean = false,
            runtimeTasksEnabled: Boolean = false,
            deviceControlEnabled: Boolean = false,
        ): JSONArray = JSONArray().apply {
            selfManagementTool?.toolDefinitions()?.forEach { definition ->
                put(
                    flattenOpenAiToolDefinition(
                        definition = definition,
                        executionMode = if (
                            definition.optJSONObject("function")?.optString("name") == "aether_config_get"
                        ) "parallel" else "sequential",
                    ),
                )
            }
            if (deviceControlEnabled) put(deviceControlToolDefinition())
            if (agentModeEnabled) put(agentModeToolDefinition())
            if (rootAccessEnabled) put(deviceRootToolDefinition())
            if (runtimeTasksEnabled) {
                put(runtimeRunToolDefinition())
                put(runtimeCheckToolDefinition())
                put(runtimeKillToolDefinition())
            }
        }

        fun sanitizeToolOutputForConversation(toolName: String, output: String): String {
            if (toolName != "agent_display") return output
            val parsed = runCatching { JSONObject(output) }.getOrNull() ?: return output
            if (!parsed.has("screenshot_base64")) return output
            parsed.remove("screenshot_base64")
            parsed.put("screenshot_injected_into_next_model_request", true)
            return parsed.toString()
        }

        fun inferToolOutputOk(output: String): Boolean {
            val parsed = runCatching { JSONObject(output) }.getOrNull() ?: return true
            return parsed.optBoolean("ok", !parsed.optBoolean("err", false))
        }
    }
}

private fun runtimeCwd(
    runtimeId: LocalRuntimeId,
    workspaceDirectory: String,
    termuxWorkspaceDirectory: String,
): String = if (runtimeId == LocalRuntimeId.Termux) termuxWorkspaceDirectory else workspaceDirectory

private val SelfManagementToolNames = setOf(
    "aether_config_get",
    "aether_config_set",
    "aether_skill_manage",
    "aether_termux_manage",
    "aether_runtime_manage",
    "aether_agent_mode_manage",
    "aether_scheduled_task_manage",
    "aether_extension_manage",
    "aether_developer_manage",
)

private fun unavailableToolOutput(toolName: String): String = JSONObject()
    .put("ok", false)
    .put("errmsg", "Host dependency for '$toolName' is not available.")
    .toString()

private fun flattenOpenAiToolDefinition(
    definition: JSONObject,
    executionMode: String,
): JSONObject {
    val function = definition.optJSONObject("function") ?: JSONObject()
    return JSONObject().apply {
        put("name", function.optString("name"))
        put("description", function.optString("description"))
        put("parameters", relaxStrictOptionalParameters(function.optJSONObject("parameters")))
        put("execution_mode", executionMode)
    }
}

private fun relaxStrictOptionalParameters(parameters: JSONObject?): JSONObject {
    val relaxed = JSONObject((parameters ?: JSONObject().put("type", "object")).toString())
    val properties = relaxed.optJSONObject("properties") ?: return relaxed
    val required = relaxed.optJSONArray("required") ?: return relaxed
    relaxed.put(
        "required",
        JSONArray().apply {
            for (index in 0 until required.length()) {
                val name = required.optString(index)
                if (name.isNotBlank() && !properties.optJSONObject(name).allowsNull()) put(name)
            }
        },
    )
    return relaxed
}

private fun JSONObject?.allowsNull(): Boolean = when (val type = this?.opt("type")) {
    "null" -> true
    is JSONArray -> (0 until type.length()).any { type.optString(it) == "null" }
    else -> false
}

private fun deviceRootToolDefinition(): JSONObject = JSONObject().apply {
    put("name", DeviceRootToolName)
    put(
        "description",
        "Run a shell command on the Android device as real root (through su). " +
            "Only available after the user enables Settings → Root access; every command may require the user's confirmation. " +
            "Use this for privileged system inspection (pm, cmd, dumpsys, settings, magisk, appops, ls /data, ...). " +
            "Keep commands narrow and idempotent: the user sees the exact command in the approval dialog. " +
            "Prefer the normal bash tool for anything that does not need root.",
    )
    put(
        "parameters",
        JSONObject().apply {
            put("type", "object")
            put(
                "properties",
                JSONObject().apply {
                    put(
                        "command",
                        stringProperty("Shell command to run as root, for example 'pm list packages -3' or 'id'."),
                    )
                    put(
                        "working_directory",
                        stringProperty("Optional absolute directory to cd into before running the command."),
                    )
                    put(
                        "reason",
                        stringProperty("Short one-line explanation shown in the approval dialog (why root is required)."),
                    )
                    put(
                        "timeout_ms",
                        integerProperty("Optional timeout in milliseconds (1000..600000, default 120000)."),
                    )
                },
            )
            put("required", JSONArray().put("command"))
            put("additionalProperties", false)
        },
    )
    put("execution_mode", "sequential")
}

/** Routes the `aether_root_shell` host tool to [DeviceRootController]. */
suspend fun DeviceRootController.executeTool(
    settings: AppSettings,
    argumentsJson: String,
): String {
    val arguments = runCatching { JSONObject(argumentsJson) }.getOrNull()
        ?: return JSONObject()
            .put("ok", false)
            .put("errmsg", "Invalid JSON arguments.")
            .toString()
    return execute(
        settings = settings,
        command = arguments.optString("command"),
        workingDirectory = arguments.optString("working_directory"),
        timeoutMillis = arguments.optLong("timeout_ms", DeviceRootDefaultTimeoutMillis),
        reason = arguments.optString("reason"),
    )
}

private const val DeviceRootToolName = "aether_root_shell"

private const val DeviceControlToolName = "device_control"
private const val RuntimeRunToolName = "aether_runtime_run"
private const val RuntimeCheckToolName = "aether_runtime_check"
private const val RuntimeKillToolName = "aether_runtime_kill"

private fun runtimeRunToolDefinition(): JSONObject = JSONObject().apply {
    put("name", RuntimeRunToolName)
    put(
        "description",
        "Run a shell command in the active runtime (Alpine proot or Termux) and wait for it. " +
            "The call blocks until the command exits and returns its stdout, stderr and exit code, " +
            "for up to ten minutes; only a run that outlives that window comes back with a run_id, " +
            "which aether_runtime_check and aether_runtime_kill then address. " +
            "Independent commands may be issued in the same turn: this tool is safe to run in parallel.",
    )
    put(
        "parameters",
        JSONObject().apply {
            put("type", "object")
            put(
                "properties",
                JSONObject().apply {
                    put("command", stringProperty("Shell command to execute inside the runtime."))
                    put(
                        "working_directory",
                        stringProperty("Optional absolute guest directory to run in (defaults to the runtime home)."),
                    )
                    put(
                        "runtime",
                        stringProperty("Optional runtime override: 'alpine' or 'termux'. Defaults to the runtime selected for this chat."),
                    )
                },
            )
            put("required", JSONArray().put("command"))
            put("additionalProperties", false)
        },
    )
    put("execution_mode", "parallel")
}

private fun runtimeCheckToolDefinition(): JSONObject = JSONObject().apply {
    put("name", RuntimeCheckToolName)
    put(
        "description",
        "Read the current state and the tail of the output of a background runtime run started with aether_runtime_run. " +
            "Returns the run_id, whether it is still running, the exit code when finished, and the last bytes of combined output.",
    )
    put(
        "parameters",
        JSONObject().apply {
            put("type", "object")
            put(
                "properties",
                JSONObject().apply {
                    put("run_id", stringProperty("The run_id returned by aether_runtime_run."))
                    put("tail_bytes", integerProperty("Optional number of output bytes to return (default 12288)."))
                },
            )
            put("required", JSONArray().put("run_id"))
            put("additionalProperties", false)
        },
    )
    put("execution_mode", "parallel")
}

private fun runtimeKillToolDefinition(): JSONObject = JSONObject().apply {
    put("name", RuntimeKillToolName)
    put(
        "description",
        "Stop a background runtime run started with aether_runtime_run and return its final state and output tail.",
    )
    put(
        "parameters",
        JSONObject().apply {
            put("type", "object")
            put(
                "properties",
                JSONObject().apply {
                    put("run_id", stringProperty("The run_id to stop."))
                    put("tail_bytes", integerProperty("Optional number of output bytes to return (default 12288)."))
                },
            )
            put("required", JSONArray().put("run_id"))
            put("additionalProperties", false)
        },
    )
    put("execution_mode", "sequential")
}

private fun agentModeToolDefinition(): JSONObject = JSONObject().apply {
    put("name", "agent_display")
    put(
        "description",
        "Operate Aether Agent Mode on an isolated Android virtual display. Use this only when Agent Mode is selected in the chat composer. " +
            "tap/swipe coordinates are normalized 0..1000 on each axis, independent of resolution; values above 1000 are rejected. " +
            "Results report width/height (display pixels), image_width/image_height (screenshot pixels), " +
            "cursor_norm_x/cursor_norm_y (last touch point, normalized) and cursor_x/cursor_y (the same point in display pixels).",
    )
    put(
        "parameters",
        JSONObject().apply {
            put("type", "object")
            put(
                "properties",
                JSONObject().apply {
                    put("action", stringProperty("One of: list_apps, start, status, launch, tap, swipe, key, text, screenshot, stop."))
                    put("query", stringProperty("For list_apps: optional app label, package, or activity filter."))
                    put("include_system", booleanProperty("For list_apps: whether to include system apps."))
                    put("max_results", integerProperty("For list_apps: maximum number of apps to return."))
                    put("target", stringProperty("For launch: package name or exact app label."))
                    listOf("x", "y", "x1", "y1", "x2", "y2").forEach { key ->
                        val axis = if (key.startsWith("x")) "width" else "height"
                        put(
                            key,
                            integerProperty(
                                "For ${if (key.length == 1) "tap" else "swipe"}: normalized $axis coordinate in 0..1000 " +
                                    "(0 = left/top edge, 1000 = right/bottom edge), NOT screenshot or display pixels. " +
                                    "Convert a screenshot pixel with pixel / image_$axis * 1000.",
                            ),
                        )
                    }
                    put("duration_ms", integerProperty("For swipe: gesture duration in milliseconds (50..10000)."))
                    put("key", stringProperty("For key: Android key code name or number."))
                    put(
                        "text",
                        stringProperty(
                            "For text: text to insert into the focused field; any Unicode (Chinese, emoji, ...) is supported. " +
                                "Tap the field first and confirm it is focused. Fails if no window on the display has input focus.",
                        ),
                    )
                },
            )
            put("required", JSONArray().put("action"))
            put("additionalProperties", false)
        },
    )
    put("execution_mode", "sequential")
}

private fun stringProperty(description: String): JSONObject = JSONObject()
    .put("type", "string")
    .put("description", description)

private fun integerProperty(description: String): JSONObject = JSONObject()
    .put("type", "integer")
    .put("description", description)

private fun booleanProperty(description: String): JSONObject = JSONObject()
    .put("type", "boolean")
    .put("description", description)

private fun deviceControlToolDefinition(): JSONObject = JSONObject().apply {
    put("name", DeviceControlToolName)
    put(
        "description",
        "Control the phone itself through Android's accessibility service — no Termux and no root. " +
            "Use action=screen first to read the current interface tree (text, buttons with bounds, " +
            "tappable and editable markers), then act with tap (x,y or text), type, swipe, back, home, " +
            "recents or open_app. Prefer text targeting over raw coordinates when an element has a " +
            "readable label. The user must keep the Aether accessibility service enabled.",
    )
    put(
        "parameters",
        JSONObject().apply {
            put("type", "object")
            put(
                "properties",
                JSONObject().apply {
                    put(
                        "action",
                        JSONObject()
                            .put("type", "string")
                            .put("description", "screen | tap | type | swipe | back | home | recents | open_app")
                            .put(
                                "enum",
                                JSONArray().put("screen").put("tap").put("type").put("swipe")
                                    .put("back").put("home").put("recents").put("open_app"),
                            ),
                    )
                    put("x", integerProperty("Tap target X coordinate in screen pixels (action=tap)."))
                    put("y", integerProperty("Tap target Y coordinate in screen pixels (action=tap)."))
                    put("text", stringProperty("Visible label to tap (action=tap) or text to type (action=type)."))
                    put("from_x", integerProperty("Swipe start X in pixels (action=swipe)."))
                    put("from_y", integerProperty("Swipe start Y in pixels (action=swipe)."))
                    put("to_x", integerProperty("Swipe end X in pixels (action=swipe)."))
                    put("to_y", integerProperty("Swipe end Y in pixels (action=swipe)."))
                    put("duration_ms", integerProperty("Swipe duration in milliseconds (action=swipe, default 320)."))
                    put("package", stringProperty("App package to launch (action=open_app), e.g. com.android.settings."))
                },
            )
            put("required", JSONArray().put("action"))
            put("additionalProperties", false)
        },
    )
    put("execution_mode", "sequential")
}

private fun executeDeviceControl(argumentsJson: String): String {
    val service = AetherAccessibilityService.instance ?: return JSONObject()
        .put("ok", false)
        .put("errmsg", "The Aether accessibility service is not enabled. Ask the user to enable Settings → Device control.")
        .toString()
    val args = runCatching { JSONObject(argumentsJson.ifBlank { "{}" }) }.getOrDefault(JSONObject())
    val action = args.optString("action").trim().lowercase()
    return runCatching {
        when (action) {
            "screen" -> JSONObject()
                .put("ok", true)
                .put("package", AetherAccessibilityService.currentPackage)
                .put("tree", service.dumpScreenTree())

            "tap" -> {
                val label = args.optString("text").trim()
                val performed = if (label.isNotEmpty()) {
                    service.clickOnText(label)
                } else {
                    service.tap(
                        args.optDouble("x").toFloat(),
                        args.optDouble("y").toFloat(),
                    )
                }
                JSONObject().put("ok", performed).put(
                    "errmsg",
                    if (performed) "" else "Tap did not land on a clickable element.",
                )
            }

            "type" -> {
                val performed = service.typeText(args.optString("text"))
                JSONObject().put("ok", performed).put(
                    "errmsg",
                    if (performed) "" else "No editable field is focused.",
                )
            }

            "swipe" -> {
                val performed = service.swipe(
                    fromX = args.optDouble("from_x").toFloat(),
                    fromY = args.optDouble("from_y").toFloat(),
                    toX = args.optDouble("to_x").toFloat(),
                    toY = args.optDouble("to_y").toFloat(),
                    durationMs = args.optLong("duration_ms", 320L).coerceIn(50L, 4_000L),
                )
                JSONObject().put("ok", performed)
            }

            "back" -> JSONObject().put("ok", service.globalBack())
            "home" -> JSONObject().put("ok", service.globalHome())
            "recents" -> JSONObject().put("ok", service.globalRecents())
            "open_app" -> JSONObject()
                .put("ok", true)
                .put(
                    "note",
                    "open_app needs the launcher intent from the app; ask the user to open the app, " +
                        "then use action=screen. Requested package: " + args.optString("package"),
                )

            else -> JSONObject().put("ok", false).put("errmsg", "Unsupported action '$action'.")
        }
    }.getOrElse { error ->
        JSONObject().put("ok", false).put("errmsg", error.message ?: "device_control failed")
    }.toString()
}
