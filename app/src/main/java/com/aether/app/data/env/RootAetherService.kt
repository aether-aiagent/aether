package com.aether.app.data.env

import android.content.Intent
import android.os.IBinder
import androidx.annotation.Keep
import com.topjohnwu.superuser.ipc.RootService

/** Bound only after an explicit root request; libsu tears it down with its client. */
@Keep
class RootAetherService : RootService() {
    private val runner = AetherUserService()
    override fun onBind(intent: Intent): IBinder = runner
    override fun onDestroy() { runner.cancelActive(); runner.stopDetachedCommands(); super.onDestroy() }
}
