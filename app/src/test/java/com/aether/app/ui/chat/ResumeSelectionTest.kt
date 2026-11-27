package com.aether.app.ui.chat

import com.aether.app.llm.ProviderConfig
import com.aether.app.llm.ProviderType
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ResumeSelectionTest {
    private fun config(id: String, model: String) = ProviderConfig(id, id, ProviderType.OPENAI_COMPAT, "http://localhost", model)

    @Test
    fun `a model picked after the pause does not match the saved provider`() {
        val saved = config("opencode", "oc/deepseek-v4.1-flash-free")
        assertFalse(ResumeSelection.matches(config("9router", "free-stack"), null, saved))
        assertFalse(ResumeSelection.matches(config("opencode", "oc/other"), null, saved))
    }

    @Test
    fun `an unchanged selection keeps the saved run`() {
        val saved = config("opencode", "oc/deepseek-v4.1-flash-free")
        assertTrue(ResumeSelection.matches(saved.copy(), null, saved))
    }

    @Test
    fun `a resolved aether model counts as the same choice`() {
        val saved = config("aether", "kilo/concrete-model")
        assertTrue(ResumeSelection.matches(config("aether", "kilo-auto/free"), "kilo/concrete-model", saved))
    }

    @Test
    fun `no saved provider never matches`() {
        assertFalse(ResumeSelection.matches(config("a", "m"), "m", null))
    }
}
