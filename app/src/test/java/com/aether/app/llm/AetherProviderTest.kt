package com.aether.app.llm

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.junit.Assert.*
import org.junit.Test
import org.junit.After

class AetherProviderTest {
    @After fun resetCatalog() { AetherProvider.restoreModels(AetherProvider.fallbackModels) }
    @Test fun stalePicksResetToDefault() {
        assertEquals(AetherProvider.DEFAULT_MODEL, AetherProvider.sanitize("ling-3.0-flash-fin-free"))
        assertEquals(AetherProvider.DEFAULT_MODEL, AetherProvider.sanitize("big-pickle"))
        assertEquals(AetherProvider.DEFAULT_MODEL, AetherProvider.sanitize("made-up-model"))
        assertEquals(AetherProvider.DEFAULT_MODEL, AetherProvider.sanitize(null))
    }

    @Test fun pooledPickSurvives() {
        assertEquals("kilo-auto/free", AetherProvider.sanitize("kilo-auto/free"))
        assertEquals("openai-fast", AetherProvider.sanitize("openai-fast"))
    }

    @Test fun customModelsSurviveSanitize() {
        assertEquals("my-custom-model", AetherProvider.sanitize("my-custom-model", setOf("my-custom-model")))
        assertEquals(AetherProvider.DEFAULT_MODEL, AetherProvider.sanitize("my-custom-model", setOf("other")))
    }

    @Test fun pooledModelsAreAcceptedAndLabeled() {
        AetherProvider.restoreModels(AetherProvider.models(listOf(ModelEntry("inclusionai/ling-3.1-flash"))))
        assertTrue(AetherProvider.isPooled("inclusionai/ling-3.1-flash"))
        assertFalse(AetherProvider.isPooled("z-ai/glm-5.2:free"))
        assertFalse(AetherProvider.isPooled("deepseek/deepseek-v4-flash-0731:free"))
        assertTrue(AetherProvider.isPooled("openai-fast"))
        assertFalse(AetherProvider.isPooled("ling-3.0-flash-fin-free"))
        assertFalse(AetherProvider.isPooled("Qwen3.5-397B-A17B"))

        assertEquals("inclusionai/ling-3.1-flash", AetherProvider.sanitize("inclusionai/ling-3.1-flash"))

        val models = AetherProvider.models(emptyList())
        val openaiFast = models.first { it.id == "openai-fast" }
        assertTrue(openaiFast.note.orEmpty().contains("Pollinations"))
        assertTrue(models.none { it.id == "nvidia/nemotron-3.5-content-safety:free" })
    }

    @Test fun wirePinMapping() {
        AetherProvider.pins = mapOf(
            "a" to ProviderType.ANTHROPIC.name,
            "b" to ProviderType.OPENAI_RESPONSES.name,
        )
        assertEquals(ProviderType.ANTHROPIC, AetherProvider.wire("a"))
        assertEquals(ProviderType.OPENAI_RESPONSES, AetherProvider.wire("b"))
        assertEquals(ProviderType.OPENAI_COMPAT, AetherProvider.wire("c"))
        AetherProvider.pins = emptyMap()
    }

    @Test fun refreshReplacesRetiredModelsAndKeepsMetadata() {
        AetherProvider.restoreModels(AetherProvider.models(listOf(ModelEntry("retired:free"))))
        val fresh = ModelEntry("new-free", reasoning = true, contextTokens = 128000)
        AetherProvider.restoreModels(AetherProvider.models(listOf(fresh)))
        assertFalse(AetherProvider.isPooled("retired:free"))
        assertEquals("new-free", AetherProvider.sanitize("retired:free"))
        assertEquals(fresh.copy(note = AetherProvider.KILO_NOTE), AetherProvider.pooledModels.first())
        assertEquals(AetherProvider.KILO_BASE_URL, AetherProvider.pool["new-free"]?.baseUrl)
    }

    @Test fun removesCredentialsWithoutImpersonatingAnotherClient() {
        val request = AetherProvider.anonymous(Request.Builder().url(AetherProvider.BASE_URL)
            .header("Authorization", "Bearer secret").header("x-api-key", "secret").build())
        assertNull(request.header("Authorization"))
        assertNull(request.header("x-api-key"))
        assertEquals("Aether", request.header("User-Agent"))
        assertFalse(request.header(AetherProvider.SESSION_HEADER).isNullOrBlank())
    }

    @Test fun preservesStableOpenCodeSession() {
        val request = AetherProvider.anonymous(Request.Builder().url(AetherProvider.BASE_URL)
            .header(AetherProvider.SESSION_HEADER, "conversation-123").build())
        assertEquals("conversation-123", request.header(AetherProvider.SESSION_HEADER))
    }

    @Test fun isOpenCodeMatchesEndpointsAndNames() {
        assertTrue(AetherProvider.isOpenCode(ProviderConfig("custom-1", "Custom", ProviderType.OPENAI_COMPAT, "https://opencode.ai/zen/v1", "model")))
        assertTrue(AetherProvider.isOpenCode(ProviderConfig("custom-2", "Custom", ProviderType.OPENAI_COMPAT, "https://opencode.ai/v1", "model")))
        assertTrue(AetherProvider.isOpenCode(ProviderConfig("custom-3", "OpenCode Go", ProviderType.OPENAI_COMPAT, "https://proxy.example.com/v1", "model")))
        assertTrue(AetherProvider.isOpenCode(AetherProvider.config))

        assertFalse(AetherProvider.isOpenCode(ProviderConfig("p1", "OpenAI", ProviderType.OPENAI_COMPAT, "https://api.openai.com/v1", "gpt-4o")))
        assertFalse(AetherProvider.isOpenCode(ProviderConfig("p2", "Anthropic", ProviderType.ANTHROPIC, "https://api.anthropic.com", "claude-3-5-sonnet")))
        assertFalse(AetherProvider.isOpenCode(ProviderConfig("p3", "OpenRouter", ProviderType.OPENAI_COMPAT, "https://openrouter.ai/api/v1", "auto")))
    }

    @Test fun withSessionInjectsHeaderAndUserAgent() {
        val builder = Request.Builder().url("https://opencode.ai/zen/v1/chat/completions")
        val req = AetherProvider.withSession(builder, "sess-xyz").build()
        assertEquals("sess-xyz", req.header(AetherProvider.SESSION_HEADER))
        assertEquals("Aether", req.header("User-Agent"))

        val fallbackBuilder = Request.Builder().url("https://opencode.ai/zen/v1/chat/completions")
        val fallbackReq = AetherProvider.withSession(fallbackBuilder, null).build()
        assertFalse(fallbackReq.header(AetherProvider.SESSION_HEADER).isNullOrBlank())
        assertEquals("Aether", fallbackReq.header("User-Agent"))
    }

    @Test fun withSessionSendsFullIdentityHeaderSet() {
        val req = AetherProvider.withSession(
            Request.Builder().url("https://opencode.ai/zen/v1/chat/completions"), "sess-1",
        ).build()
        assertFalse(req.header("x-opencode-request").isNullOrBlank())
        assertEquals("aether", req.header("x-opencode-client"))
        assertFalse(req.header("x-opencode-project").isNullOrBlank())
    }

    @Test fun customOpenCodeGoProviderInjectsHeadersWithoutStrippingAuth() {
        val customConfig = ProviderConfig("custom-uuid", "OpenCode Go", ProviderType.OPENAI_COMPAT, "https://opencode.ai/zen/v1", "model")
        val dummyBody = "{}".toRequestBody("application/json".toMediaType())
        val req = OpenAiCompatProvider(okhttp3.OkHttpClient(), ProviderFactory.json).buildRequest(
            customConfig,
            "secret-token",
            dummyBody,
            RequestOptions(cacheKey = "my-chat-session"),
        )
        assertEquals("Bearer secret-token", req.header("Authorization"))
        assertEquals("my-chat-session", req.header(AetherProvider.SESSION_HEADER))
        assertEquals("Aether", req.header("User-Agent"))
    }

    @Test fun modelCatalogInjectsOpenCodeHeadersWhileKeepingAuth() {
        val customConfig = ProviderConfig("custom-uuid", "OpenCode Go", ProviderType.OPENAI_COMPAT, "https://opencode.ai/zen/v1", "model")
        val req = ModelCatalog.buildRequest(customConfig, "secret-token")
        assertEquals("Bearer secret-token", req.header("Authorization"))
        assertFalse(req.header(AetherProvider.SESSION_HEADER).isNullOrBlank())
        assertEquals("Aether", req.header("User-Agent"))

        val aetherReq = ModelCatalog.buildRequest(AetherProvider.config, "ignored")
        assertNull(aetherReq.header("Authorization"))
        assertEquals(AetherProvider.KILO_BASE_URL + "/models", aetherReq.url.toString())
        assertNull(aetherReq.header(AetherProvider.SESSION_HEADER))
        assertEquals("Aether", aetherReq.header("User-Agent"))
    }
}
