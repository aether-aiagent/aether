package com.aether.app.ui.theme

import com.aether.app.data.AppSettings
import kotlinx.serialization.json.Json
import org.junit.Assert.*
import org.junit.Test

class AetherGlassModeTest {
    @Test fun olderDevicesAndDisabledExperimentsNeverSelectUnsupportedEffects() {
        for (sdk in listOf(26, 30, 31, 32, 33, 36)) {
            assertEquals(AetherGlassMode.OFF, AetherGlassMode.resolve(false, true, sdk))
        }
        assertEquals(AetherGlassMode.OFF, AetherGlassMode.resolve(true, true, 30))
        assertEquals(AetherGlassMode.FROSTED, AetherGlassMode.resolve(true, true, 31))
        assertEquals(AetherGlassMode.FROSTED, AetherGlassMode.resolve(true, true, 32))
        assertEquals(AetherGlassMode.FROSTED, AetherGlassMode.resolve(true, false, 33))
        assertEquals(AetherGlassMode.LIQUID, AetherGlassMode.resolve(true, true, 33))
    }

    @Test fun oldSettingsStayOffAndPortableSettingsRetainBothSwitches() {
        val old = Json.decodeFromString<AppSettings>("{}")
        assertFalse(old.aetherGlassEnabled)
        assertFalse(old.aetherLiquidGlass)
        assertEquals(.5f, old.aetherGlassTransparency)
        for (liquid in listOf(false, true)) {
            val saved = old.copy(aetherGlassEnabled = true, aetherLiquidGlass = liquid, aetherGlassTransparency = .8f)
            val restored = Json.decodeFromString<AppSettings>(Json.encodeToString(saved))
            assertEquals(saved, restored)
        }
    }

    @Test fun transparencyPreservesTheDefaultAndNeverChangesForegroundOpacity() {
        assertEquals(1f, liquidGlassOpacity(.3f, 0f), .001f)
        assertEquals(.3f, liquidGlassOpacity(.3f, .5f), .001f)
        assertEquals(0f, liquidGlassOpacity(.3f, 1f), .001f)
        assertEquals(.3f, liquidGlassOpacity(.3f, Float.NaN), .001f)
        assertEquals(1f, liquidGlassOpacity(.3f, -1f), .001f)
        assertEquals(0f, liquidGlassOpacity(.3f, 2f), .001f)
    }
}
