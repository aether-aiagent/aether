package com.aether.app.assistant

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionService
import android.speech.SpeechRecognizer
import android.service.voice.VoiceInteractionService
import android.service.voice.VoiceInteractionSession
import android.service.voice.VoiceInteractionSessionService

/** Bound by Android while Aether is the chosen digital assistant app. */
class AetherAssistantService : VoiceInteractionService()

/** Hands Android one floating panel per assistant call. */
class AetherAssistantSessionService : VoiceInteractionSessionService() {
    override fun onNewSession(args: Bundle?): VoiceInteractionSession = AetherAssistantSession(this)
}

/**
 * Picks the phone's real speech recognizer. Choosing Aether as the assistant can make
 * Android route recognition to [AetherRecognitionService], which only declines, so the app's
 * own voice input asks another installed recognizer instead (Google's first).
 */
internal object SpeechRecognizers {
    fun create(context: Context): SpeechRecognizer {
        val default = runCatching {
            android.provider.Settings.Secure.getString(context.contentResolver, "voice_recognition_service")
        }.getOrNull()?.let(ComponentName::unflattenFromString)
        if (default == null || default.packageName != context.packageName) return SpeechRecognizer.createSpeechRecognizer(context)
        val other = context.packageManager.queryIntentServices(Intent(RecognitionService.SERVICE_INTERFACE), 0)
            .mapNotNull { it.serviceInfo }
            .filter { it.packageName != context.packageName }
            .sortedByDescending { it.packageName.startsWith("com.google.") }
            .firstOrNull()
            ?: return SpeechRecognizer.createSpeechRecognizer(context)
        return SpeechRecognizer.createSpeechRecognizer(context, ComponentName(other.packageName, other.name))
    }
}

/**
 * Android only accepts an assistant that also names a speech recognizer. The panel is
 * text first, so this one turns every request down instead of pretending to listen.
 */
class AetherRecognitionService : RecognitionService() {
    override fun onStartListening(recognizerIntent: Intent?, listener: Callback?) {
        runCatching { listener?.error(SpeechRecognizer.ERROR_CLIENT) }
    }
    override fun onCancel(listener: Callback?) = Unit
    override fun onStopListening(listener: Callback?) = Unit
}
