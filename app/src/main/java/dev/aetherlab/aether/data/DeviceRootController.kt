package dev.aetherlab.aether.data

import android.content.Context
import java.io.File
import java.io.InputStream
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONObject

internal const val DeviceRootProbeTimeoutMillis = 2_000L
internal const val DeviceRootDefaultTimeoutMillis = 120_000L
internal const val DeviceRootMaxTimeoutMillis = 600_000L

/** How long the settings page waits for the superuser prompt when granting root once. */
internal const val DeviceRootGrantProbeTimeoutMillis = 60_000L

/** Command used to prove that root is really granted. */
internal const val RootGrantProbeCommand = "id -u"

/** How long the agent waits for the user to answer a root confirmation. */
internal const val DeviceRootApprovalTimeoutMillis = 180_000L

private const val DeviceRootMaxOutputChars = 200_000

private val SuCandidatePaths = listOf(
    "/system/bin/su",
    "/system/xbin/su",
    "/sbin/su",
    "/su/bin/su",
    "/debug_ramdisk/su",
    "/data/adb/ksu/bin/su",
    "/data/adb/ap/bin/su",
    "/data/adb/magisk/su",
)

enum class RootAccessIssue {
    Unknown,
    Available,
    Unavailable,
    Disabled,
}

/** Snapshot of device root availability used by the settings page and the agent. */
data class RootAccessState(
    val issue: RootAccessIssue = RootAccessIssue.Unknown,
    val detail: String = "",
    val suPath: String = "",
    val chrootPath: String = "",
    val lastUpdatedMillis: Long = 0L,
) {
    val isAvailable: Boolean
        get() = issue == RootAccessIssue.Available

    val chrootAvailable: Boolean
        get() = chrootPath.isNotBlank() && File(chrootPath, "bin/sh").exists()
}

enum class RootApprovalDecision {
    Deny,
    AllowOnce,
    AllowAlways,
}

/**
 * A pending "may Aether run this command as root?" request. Rendered by the
 * chat screen as a blocking confirmation dialog.
 */
data class RootApprovalRequest(
    val id: String,
    val command: String,
    val reason: String,
    val scope: RootShellScope,
    val requestedAtMillis: Long,
)

private data class RootProcessResult(
    val exitCode: Int,
    val stdout: String = "",
    val stderr: String = "",
    val timedOut: Boolean = false,
    val launchError: String = "",
    val durationMillis: Long = 0L,
) {
    fun combinedOutput(): String = listOf(stdout, stderr, launchError)
        .map(String::trim)
        .filter(String::isNotBlank)
        .joinToString("\n")
}

/**
 * Owns device root access for the Aether agent.
 *
 * Nothing is ever executed with `su` without passing through [execute] which
 * applies the user-configured [RootApprovalPolicy]. Approved commands can be
 * stored in the allowlist so the user only has to confirm each command once.
 */
class DeviceRootController(
    private val context: Context,
    private val diagnosticLogger: AetherDiagnosticLogger = AetherDiagnosticLogger.NoOp,
    private val chrootRootProvider: () -> String? = { null },
    private val onAllowlistEntryApproved: suspend (String) -> Unit = {},
) {
    private val _state = MutableStateFlow(RootAccessState())
    val state: StateFlow<RootAccessState> = _state.asStateFlow()

    private val _pendingApproval = MutableStateFlow<RootApprovalRequest?>(null)
    val pendingApproval: StateFlow<RootApprovalRequest?> = _pendingApproval.asStateFlow()

    private val decisions = ConcurrentHashMap<String, CompletableDeferred<RootApprovalDecision>>()

    @Volatile
    private var cachedSuPath: String? = null

    suspend fun inspect(): RootAccessState = withContext(Dispatchers.IO) {
        val state = runCatching {
            val suPath = resolveSuPath()
            val chrootPath = chrootRootProvider().orEmpty()
            val chrootReady = chrootPath.isNotBlank() && File(chrootPath, "bin/sh").exists()
            if (suPath.isBlank()) {
                RootAccessState(
                    issue = RootAccessIssue.Unavailable,
                    detail = "No su binary was detected. Install Magisk, KernelSU or APatch to grant device root.",
                    chrootPath = chrootPath,
                    lastUpdatedMillis = System.currentTimeMillis(),
                )
            } else {
                RootAccessState(
                    issue = RootAccessIssue.Available,
                    detail = buildString {
                        append("su detected at ")
                        append(suPath)
                        append('.')
                        if (chrootReady) {
                            append(" The Alpine chroot is ready for real-root execution.")
                        }
                    },
                    suPath = suPath,
                    chrootPath = chrootPath,
                    lastUpdatedMillis = System.currentTimeMillis(),
                )
            }
        }.getOrElse { throwable ->
            RootAccessState(
                issue = RootAccessIssue.Unavailable,
                detail = "Unable to check device root: " +
                    (throwable.message?.trim().takeUnless { it.isNullOrBlank() }
                        ?: throwable.javaClass.simpleName),
                lastUpdatedMillis = System.currentTimeMillis(),
            )
        }
        _state.value = state
        state
    }

    /**
     * Asks the Android su manager for root once (the familiar superuser prompt) and reports what
     * came back. This is the whole "enable root" flow: no Termux, no Alpine, no bootstrap script.
     *
     * The probe never throws: on a device without a su binary it simply returns the unavailable
     * state, and a denied prompt is reported in [RootAccessState.detail].
     */
    suspend fun requestRootAccess(): RootAccessState = withContext(Dispatchers.IO) {
        val inspected = inspect()
        if (inspected.suPath.isBlank()) return@withContext inspected
        val probe = runCatching {
            runProcess(
                argv = listOf(inspected.suPath, "-c", RootGrantProbeCommand),
                timeoutMillis = DeviceRootGrantProbeTimeoutMillis,
            )
        }.getOrElse { throwable ->
            RootProcessResult(
                exitCode = -1,
                launchError = throwable.message.orEmpty(),
            )
        }
        val uid = probe.stdout.lineSequence()
            .map(String::trim)
            .firstOrNull { it.isNotEmpty() }
            .orEmpty()
        val granted = !probe.timedOut && probe.launchError.isBlank() && uid == "0"
        val output = probe.combinedOutput()
        val state = inspected.copy(
            issue = if (granted) RootAccessIssue.Available else inspected.issue,
            detail = if (granted) {
                "Root granted (uid 0) through ${inspected.suPath}."
            } else {
                buildString {
                    append("Root was not granted through ")
                    append(inspected.suPath)
                    append('.')
                    if (probe.timedOut) {
                        append(" The superuser prompt was not answered.")
                    } else if (output.isNotBlank()) {
                        append(' ')
                        append(output.take(400))
                    }
                }
            },
            lastUpdatedMillis = System.currentTimeMillis(),
        )
        diagnosticLogger.event(
            category = "device_root",
            event = if (granted) "root_granted" else "root_not_granted",
            level = if (granted) "info" else "warn",
            details = mapOf(
                "su_path" to inspected.suPath,
                "uid" to uid,
                "timed_out" to probe.timedOut,
                "launch_error" to probe.launchError,
                "output" to output.take(1_200),
            ),
        )
        _state.value = state
        state
    }

    /** Answers a pending confirmation. Returns true when the request existed. */
    fun respondToApproval(
        requestId: String,
        decision: RootApprovalDecision,
    ): Boolean {
        val deferred = decisions[requestId] ?: return false
        if (_pendingApproval.value?.id == requestId) {
            _pendingApproval.value = null
        }
        return deferred.complete(decision)
    }

    /** Cancels every pending confirmation; used when a turn is stopped. */
    fun dismissPendingApproval() {
        _pendingApproval.value?.let { request ->
            decisions[request.id]?.complete(RootApprovalDecision.Deny)
        }
        _pendingApproval.value = null
    }

    /**
     * Runs [command] as root and returns a JSON result string for the agent.
     */
    suspend fun execute(
        settings: AppSettings,
        command: String,
        workingDirectory: String = "",
        timeoutMillis: Long = DeviceRootDefaultTimeoutMillis,
        reason: String = "",
        skipApproval: Boolean = false,
    ): String {
        val trimmedCommand = command.trim()
        if (trimmedCommand.isEmpty()) {
            return errorJson("command is required.")
        }
        if (!settings.rootAccessEnabled) {
            return errorJson(
                "Device root access is disabled. Enable Settings → Root access (Aether root) first.",
            )
        }
        val suPath = resolveSuPath()
        if (suPath.isBlank()) {
            return errorJson(
                "No su binary was detected on this device, so device root is unavailable.",
            )
        }
        val scope = settings.rootShellScope
        val chrootPath = chrootRootProvider().orEmpty()
        if (scope == RootShellScope.Chroot) {
            if (chrootPath.isBlank() || !File(chrootPath, "bin/sh").exists()) {
                return errorJson(
                    "The Alpine chroot is not installed yet. Open Settings → Alpine and finish setup, " +
                        "or switch Root access to the Android system root shell.",
                )
            }
        }

        val signature = rootCommandSignature(trimmedCommand)
        val allowlisted = isRootCommandAllowlisted(trimmedCommand, settings.rootCommandAllowlist)
        val requiresApproval = !skipApproval && when (settings.rootApprovalPolicy) {
            RootApprovalPolicy.Always -> false
            RootApprovalPolicy.Allowlist -> !allowlisted
            RootApprovalPolicy.Ask -> true
        }

        if (requiresApproval) {
            val request = RootApprovalRequest(
                id = UUID.randomUUID().toString(),
                command = trimmedCommand,
                reason = reason.trim(),
                scope = scope,
                requestedAtMillis = System.currentTimeMillis(),
            )
            diagnosticLogger.event(
                category = "device_root",
                event = "approval_requested",
                details = mapOf(
                    "command" to signature,
                    "scope" to scope.storageValue,
                    "policy" to settings.rootApprovalPolicy.storageValue,
                ),
            )
            when (awaitApproval(request)) {
                RootApprovalDecision.Deny -> {
                    diagnosticLogger.event(
                        category = "device_root",
                        event = "approval_denied",
                        level = "warn",
                        details = mapOf("command" to signature),
                    )
                    return errorJson(
                        "The user denied this root command. Ask again with a narrower command if it is really needed.",
                    )
                }

                RootApprovalDecision.AllowAlways -> {
                    runCatching { onAllowlistEntryApproved(signature) }
                    diagnosticLogger.event(
                        category = "device_root",
                        event = "approval_allowed_always",
                        details = mapOf("command" to signature),
                    )
                }

                RootApprovalDecision.AllowOnce -> diagnosticLogger.event(
                    category = "device_root",
                    event = "approval_allowed_once",
                    details = mapOf("command" to signature),
                )
            }
        }

        val effectiveCommand = if (workingDirectory.isBlank()) {
            trimmedCommand
        } else {
            "cd ${singleQuote(workingDirectory)} && $trimmedCommand"
        }
        val argv = buildRootArgv(
            suPath = suPath,
            scope = scope,
            chrootPath = chrootPath,
            command = effectiveCommand,
        )
        val safeTimeout = timeoutMillis
            .coerceIn(1_000L, DeviceRootMaxTimeoutMillis)
        val startedAt = System.currentTimeMillis()
        val result = withContext(Dispatchers.IO) {
            runProcess(argv = argv, timeoutMillis = safeTimeout)
        }
        val duration = System.currentTimeMillis() - startedAt
        diagnosticLogger.event(
            category = "device_root",
            event = if (result.exitCode == 0 && !result.timedOut) "command_succeeded" else "command_failed",
            level = if (result.exitCode == 0 && !result.timedOut) "info" else "warn",
            details = mapOf(
                "command" to signature,
                "scope" to scope.storageValue,
                "exit_code" to result.exitCode,
                "timed_out" to result.timedOut,
                "duration_ms" to duration,
                "stdout" to result.stdout.take(1_500),
                "stderr" to result.stderr.take(1_500),
                "launch_error" to result.launchError,
            ),
        )
        return JSONObject().apply {
            put("ok", result.exitCode == 0 && !result.timedOut && result.launchError.isBlank())
            put("root", true)
            put("scope", scope.storageValue)
            put("command", trimmedCommand)
            put("exit_code", result.exitCode)
            put("timed_out", result.timedOut)
            put("duration_ms", duration)
            put("stdout", result.stdout.take(DeviceRootMaxOutputChars))
            put("stderr", result.stderr.take(DeviceRootMaxOutputChars))
            if (result.launchError.isNotBlank()) put("errmsg", result.launchError)
            if (result.timedOut) {
                put(
                    "errmsg",
                    "Root command timed out after ${safeTimeout} ms. Long-running work belongs in the Alpine terminal.",
                )
            }
        }.toString()
    }

    /**
     * Runs a harmless probe so the settings page can verify su end to end.
     *
     * The user pressed the button, so this deliberately skips the chat approval prompt: that
     * dialog only exists on the chat screen and would otherwise leave the call waiting until it
     * times out. It also always uses the Android system shell so a missing Alpine chroot cannot
     * make the root test look broken.
     */
    suspend fun runSelfTest(): String = execute(
        settings = AppSettings(
            rootAccessEnabled = true,
            rootApprovalPolicy = RootApprovalPolicy.Always,
            rootShellScope = RootShellScope.Device,
        ),
        command = "id -u; id -un 2>/dev/null || true",
        timeoutMillis = 15_000L,
        reason = "Aether root self-test",
        skipApproval = true,
    )

    private suspend fun awaitApproval(request: RootApprovalRequest): RootApprovalDecision {
        val deferred = CompletableDeferred<RootApprovalDecision>()
        decisions[request.id] = deferred
        _pendingApproval.value = request
        val decision = withTimeoutOrNull(DeviceRootApprovalTimeoutMillis) {
            deferred.await()
        } ?: RootApprovalDecision.Deny
        decisions.remove(request.id)
        if (_pendingApproval.value?.id == request.id) {
            _pendingApproval.value = null
        }
        return decision
    }

    private fun resolveSuPath(): String {
        cachedSuPath?.let { cached -> if (cached.isNotBlank()) return cached }
        val fromKnownPaths = runCatching {
            SuCandidatePaths.firstOrNull { path ->
                File(path).let { it.exists() && it.canExecute() }
            }
        }.getOrNull()
        val found = fromKnownPaths ?: probeSuFromPath()
        if (found.isNotBlank()) cachedSuPath = found
        return found
    }

    private fun probeSuFromPath(): String {
        val result = runProcess(
            argv = listOf("sh", "-c", "command -v su 2>/dev/null || true"),
            timeoutMillis = DeviceRootProbeTimeoutMillis,
        )
        return result.stdout.lineSequence()
            .map(String::trim)
            .firstOrNull { it.isNotEmpty() && it.startsWith("/") }
            .orEmpty()
    }

    private fun buildRootArgv(
        suPath: String,
        scope: RootShellScope,
        chrootPath: String,
        command: String,
    ): List<String> = when (scope) {
        RootShellScope.Device -> listOf(
            suPath,
            "-c",
            "export PATH=/system/bin:/system/xbin:/sbin:\$PATH; $command",
        )

        RootShellScope.Chroot -> listOf(
            suPath,
            "-c",
            "chroot ${singleQuote(chrootPath)} /bin/sh -lc ${singleQuote(command)}",
        )
    }

    private fun runProcess(
        argv: List<String>,
        timeoutMillis: Long,
    ): RootProcessResult {
        val startedAt = System.currentTimeMillis()
        val process = runCatching { ProcessBuilder(argv).start() }
            .getOrElse { throwable ->
                return RootProcessResult(
                    exitCode = -1,
                    launchError = throwable.message.orEmpty().ifBlank {
                        "Unable to start the root process."
                    },
                    durationMillis = System.currentTimeMillis() - startedAt,
                )
            }
        val stdoutReader = process.inputStream.startReadingText()
        val stderrReader = process.errorStream.startReadingText()
        val finished = runCatching {
            process.waitFor(timeoutMillis, TimeUnit.MILLISECONDS)
        }.getOrDefault(false)
        if (!finished) {
            runCatching { process.destroy() }
            if (!process.waitFor(1_000L, TimeUnit.MILLISECONDS)) {
                runCatching { process.destroyForcibly() }
                process.waitFor(1_000L, TimeUnit.MILLISECONDS)
            }
            runCatching { process.inputStream.close() }
            runCatching { process.errorStream.close() }
        }
        val exitCode = if (finished) runCatching { process.exitValue() }.getOrDefault(-1) else -1
        return RootProcessResult(
            exitCode = exitCode,
            stdout = stdoutReader.awaitText(),
            stderr = stderrReader.awaitText(),
            timedOut = !finished,
            durationMillis = System.currentTimeMillis() - startedAt,
        )
    }

    private fun InputStream.startReadingText(): RootStreamReader {
        val output = StringBuffer()
        val thread = Thread(
            {
                runCatching {
                    bufferedReader().use { reader -> output.append(reader.readText()) }
                }
            },
            "AetherDeviceRootStreamReader",
        ).apply {
            isDaemon = true
            start()
        }
        return RootStreamReader(thread, output)
    }

    private fun RootStreamReader.awaitText(): String {
        runCatching { thread.join(1_500L) }
        return output.toString()
    }

    private fun errorJson(message: String): String = JSONObject()
        .put("ok", false)
        .put("root", false)
        .put("errmsg", message)
        .toString()
}

private data class RootStreamReader(
    val thread: Thread,
    val output: StringBuffer,
)

private fun singleQuote(value: String): String =
    "'" + value.replace("'", "'\"'\"'") + "'"