package dev.aetherlab.aether.data

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Bitmap
import android.graphics.Path
import android.graphics.Rect
import android.os.Build
import android.view.Display
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Device control without Termux: reads the screen tree, takes screenshots and performs
 * gestures through the accessibility service. Everything here must be safe to call from a
 * background coroutine, so failures are returned as values instead of thrown exceptions.
 */
class AetherAccessibilityService : AccessibilityService() {

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        connectedSinceMillis = System.currentTimeMillis()
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val packageName = event?.packageName?.toString().orEmpty()
        if (packageName.isNotBlank() && packageName != currentPackage) {
            currentPackage = packageName
        }
    }

    override fun onInterrupt() = Unit

    override fun onDestroy() {
        if (instance === this) instance = null
        super.onDestroy()
    }

    fun dumpScreenTree(limit: Int = 220): String {
        val root = rootInActiveWindow ?: return ""
        val builder = StringBuilder()
        val counter = intArrayOf(0)
        appendNode(builder, root, 0, counter, limit)
        return builder.toString()
    }

    private fun appendNode(
        builder: StringBuilder,
        node: AccessibilityNodeInfo?,
        depth: Int,
        counter: IntArray,
        limit: Int,
    ) {
        if (node == null || counter[0] >= limit) return
        counter[0] += 1
        val bounds = Rect()
        node.getBoundsInScreen(bounds)
        val label = buildString {
            val text = node.text?.toString()?.takeIf { it.isNotBlank() }
            val description = node.contentDescription?.toString()?.takeIf { it.isNotBlank() }
            if (text != null) append("text=\"").append(text.take(120)).append('"')
            if (description != null) {
                if (isNotEmpty()) append(' ')
                append("desc=\"").append(description.take(80)).append('"')
            }
            if (isEmpty()) append(node.className?.toString()?.substringAfterLast('.') ?: "node")
        }
        builder.append("  ".repeat(depth))
            .append(label)
            .append(" [").append(bounds.left).append(',').append(bounds.top)
            .append('-').append(bounds.right).append(',').append(bounds.bottom).append(']')
        if (node.isClickable) builder.append(" tap")
        if (node.isEditable) builder.append(" edit")
        if (node.isScrollable) builder.append(" scroll")
        builder.append('\n')
        for (index in 0 until node.childCount) {
            appendNode(builder, node.getChild(index), depth + 1, counter, limit)
        }
    }

    fun screenSize(): Pair<Int, Int> {
        val metrics = resources.displayMetrics
        return metrics.widthPixels to metrics.heightPixels
    }

    fun tap(x: Float, y: Float, durationMs: Long = 60L): Boolean {
        val path = Path().apply { moveTo(x, y) }
        return dispatch(path, 0L, durationMs.coerceAtLeast(1L))
    }

    fun swipe(
        fromX: Float,
        fromY: Float,
        toX: Float,
        toY: Float,
        durationMs: Long = 320L,
    ): Boolean {
        val path = Path().apply {
            moveTo(fromX, fromY)
            lineTo(toX, toY)
        }
        return dispatch(path, 0L, durationMs.coerceAtLeast(1L))
    }

    private fun dispatch(path: Path, startMs: Long, durationMs: Long): Boolean {
        var completed = false
        val latch = CountDownLatch(1)
        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, startMs, durationMs))
            .build()
        val callback = object : GestureResultCallback() {
            override fun onCompleted(gestureDescription: GestureDescription?) {
                completed = true
                latch.countDown()
            }

            override fun onCancelled(gestureDescription: GestureDescription?) {
                completed = false
                latch.countDown()
            }
        }
        val dispatched = dispatchGesture(gesture, callback, null)
        if (!dispatched) return false
        latch.await(2, TimeUnit.SECONDS)
        return completed
    }

    fun typeText(text: String): Boolean {
        val root = rootInActiveWindow ?: return false
        val focused = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT) ?: return false
        val arguments = android.os.Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
        }
        return focused.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments)
    }

    fun clickOnText(needle: String): Boolean {
        val root = rootInActiveWindow ?: return false
        val match = findByLabel(root, needle, depth = 0) ?: return false
        var target: AccessibilityNodeInfo? = match
        while (target != null && !target.isClickable) {
            target = target.parent
        }
        return (target ?: match).performAction(AccessibilityNodeInfo.ACTION_CLICK)
    }

    private fun findByLabel(
        node: AccessibilityNodeInfo?,
        needle: String,
        depth: Int,
    ): AccessibilityNodeInfo? {
        if (node == null || depth > 30) return null
        val label = node.text?.toString() ?: node.contentDescription?.toString()
        if (label != null && label.contains(needle, ignoreCase = true)) return node
        for (index in 0 until node.childCount) {
            findByLabel(node.getChild(index), needle, depth + 1)?.let { return it }
        }
        return null
    }

    fun globalBack(): Boolean = performGlobalAction(GLOBAL_ACTION_BACK)

    fun globalHome(): Boolean = performGlobalAction(GLOBAL_ACTION_HOME)

    fun globalRecents(): Boolean = performGlobalAction(GLOBAL_ACTION_RECENTS)

    fun screenshotToFile(target: File): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return false
        val latch = CountDownLatch(1)
        var saved = false
        takeScreenshot(
            Display.DEFAULT_DISPLAY,
            mainExecutor,
            object : TakeScreenshotCallback {
                override fun onSuccess(screenshot: ScreenshotResult) {
                    saved = runCatching {
                        val bitmap = Bitmap.wrapHardwareBuffer(screenshot.hardwareBuffer, screenshot.colorSpace)
                        target.parentFile?.mkdirs()
                        FileOutputStream(target).use { stream ->
                            bitmap?.compress(Bitmap.CompressFormat.PNG, 100, stream)
                        }
                        screenshot.hardwareBuffer.close()
                        bitmap != null
                    }.getOrDefault(false)
                    latch.countDown()
                }

                override fun onFailure(errorCode: Int) {
                    saved = false
                    latch.countDown()
                }
            },
        )
        latch.await(3, TimeUnit.SECONDS)
        return saved
    }

    companion object {
        @Volatile
        var instance: AetherAccessibilityService? = null

        @Volatile
        var connectedSinceMillis: Long = 0L

        @Volatile
        var currentPackage: String = ""

        fun isConnected(): Boolean = instance != null
    }
}