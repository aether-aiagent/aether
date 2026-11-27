package com.aether.app.llm

import com.aether.app.agent.StreamRetrier
import com.aether.app.core.ChatMessage
import com.aether.app.core.Role
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import okhttp3.*
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.After
import org.junit.Assert.*
import org.junit.Test

class AetherFreeLimitTest {
    @After fun reset() { AetherProvider.restoreModels(AetherProvider.fallbackModels) }
    private fun client(body: String, code: Int, retryAfter: String? = null, requests: () -> Unit = {}) =
        OkHttpClient.Builder().addInterceptor { chain ->
            requests()
            assertNull(chain.request().header("Authorization"))
            Response.Builder().request(chain.request()).protocol(Protocol.HTTP_1_1).code(code).message("Fixture")
                .apply { retryAfter?.let { header("Retry-After", it) } }
                .body(body.toResponseBody()).build()
        }.build()
    private fun stream(body: String, code: Int = 429, retryAfter: String? = null, model: String = AetherProvider.DEFAULT_MODEL,
        requests: () -> Unit = {}) = AetherProvider.create(client(body, code, retryAfter, requests)).streamChat(
        AetherProvider.config.copy(model = model), AetherProvider.KEYLESS, "",
        listOf(ChatMessage(Role.USER, "Hello")), emptyList(), RequestOptions())

    @Test fun `current anonymous promotion refusal becomes friendly terminal quota notice`() = runBlocking {
        val body = """{"error":{"code":"PROMOTION_MODEL_LIMIT_REACHED","message":"Sign up for free to continue and explore 500 other models. Takes 2 minutes, no credit card required. Or come back later."},"error_type":"rate_limit_exceeded"}"""
        val failure = stream(body).toList().filterIsInstance<StreamEvent.Failure>().single()
        assertEquals(AetherFreeLimit.QUOTA_CODE, failure.errorCode)
        assertEquals(false, failure.retryable)
        assertEquals(AetherFreeLimit.Kind.QUOTA, AetherFreeLimit.notice(failure.message)?.kind)
        assertFalse(failure.message.contains("Sign up"))
        assertNull(AetherFreeLimit.notice(failure.message)?.retryAfterSeconds)
        assertEquals(FallbackFailureKind.QUOTA, fallbackFailureKind(failure))
    }

    @Test fun `documented and account free limit messages are recognized`() = runBlocking {
        for (body in listOf(
            """{"error":{"message":"Rate limit exceeded for free models. Please try again later.","code":429}}""",
            """{"error":"Rate limit exceeded","message":"Free model usage limit reached. Please try again later, or switch to a paid model or your own API key."}"""
        )) assertEquals(AetherFreeLimit.QUOTA_CODE, stream(body).toList().filterIsInstance<StreamEvent.Failure>().single().errorCode)
    }

    @Test fun `SSE quota refusal preserves an explicit body delay`() = runBlocking {
        val body = "data: {\"error\":{\"code\":\"PROMOTION_MODEL_LIMIT_REACHED\",\"message\":\"Come back later\",\"metadata\":{\"retry_after_seconds\":120}}}\n\n"
        val failure = stream(body, 200).toList().filterIsInstance<StreamEvent.Failure>().single()
        assertEquals(AetherFreeLimit.QUOTA_CODE, failure.errorCode)
        assertEquals(120L, AetherFreeLimit.notice(failure.message)?.retryAfterSeconds)
    }

    @Test fun `known hourly quota is not retried or auto continued`() = runBlocking {
        var requests = 0
        var recoverable = true
        val result = StreamRetrier.run(
            streamFor = { stream("""{"error":{"code":"PROMOTION_MODEL_LIMIT_REACHED","message":"Come back later"}}""", requests = { requests++ }) },
            onAttemptStart = {}, hasOutput = { false }, handleEvent = {}, retryReason = { it },
            emitEvent = { fail("A known exhausted quota must not start a retry countdown") }, sleep = {},
            onTerminalFailure = { recoverable = it })
        assertEquals(1, requests)
        assertFalse(recoverable)
        assertNotNull(AetherFreeLimit.notice(result))
    }

    @Test fun `temporary upstream limits do not claim the hourly quota is exhausted`() = runBlocking {
        val failure = stream("""{"error":{"message":"Upstream model rate limit exceeded","metadata":{"limit_source":"upstream_provider_shared_pool","retry_after_seconds":1}}}""")
            .toList().filterIsInstance<StreamEvent.Failure>().single()
        assertEquals(AetherFreeLimit.RATE_CODE, failure.errorCode)
        assertEquals(AetherFreeLimit.Kind.TEMPORARY, AetherFreeLimit.notice(failure.message)?.kind)
        assertNotEquals(false, failure.retryable)
        assertEquals(1L, AetherFreeLimit.notice(failure.message)?.retryAfterSeconds)
    }

    @Test fun `HTTP retry after is shown when supplied`() = runBlocking {
        val failure = stream("""{"error":{"code":"PROMOTION_MODEL_LIMIT_REACHED"}}""", retryAfter = "3600")
            .toList().filterIsInstance<StreamEvent.Failure>().single()
        assertEquals(3600L, AetherFreeLimit.notice(failure.message)?.retryAfterSeconds)
    }

    @Test fun `auth server and other Aether upstream errors retain their normal behavior`() = runBlocking {
        for (code in listOf(400, 401, 403, 500, 503)) {
            val failure = stream("""{"error":{"message":"Original error"}}""", code)
                .toList().filterIsInstance<StreamEvent.Failure>().single()
            assertNull(AetherFreeLimit.notice(failure.message))
            assertEquals(code, failure.code)
            assertTrue(failure.message.contains("Original error"))
        }
        try {
            stream("""{"error":{"message":"Rate limit exceeded for free models"}}""", model = "openai-fast").toList()
            fail("Pollinations should keep its original error")
        } catch (e: ApiException) { assertNull(AetherFreeLimit.notice(e.message)) }
    }

    @Test fun `recovery suppression is scoped to friendly notices and saved Aether Kilo failures`() {
        val raw = """HTTP 429: {"error":{"code":"PROMOTION_MODEL_LIMIT_REACHED","message":"Come back later"}}"""
        val other = AetherProvider.config.copy(id = "other", name = "Other provider")
        assertTrue(AetherFreeLimit.suppressRecovery(raw, AetherProvider.config))
        assertFalse(AetherFreeLimit.suppressRecovery(raw, other))
        assertFalse(AetherFreeLimit.suppressRecovery("HTTP 429: Too many requests", other))
        assertFalse(AetherFreeLimit.suppressRecovery("HTTP 503: Unavailable", AetherProvider.config))
        assertFalse(AetherFreeLimit.suppressRecovery("HTTP 401: Authentication required", AetherProvider.config))
        assertFalse(AetherFreeLimit.suppressRecovery("HTTP 429: Too many requests", AetherProvider.config.copy(model = "openai-fast")))
        // Only the hourly quota hides Continue; a temporary limit clears within a minute or so.
        assertTrue(AetherFreeLimit.suppressRecovery(AetherFreeLimit.message(AetherFreeLimit.Notice(AetherFreeLimit.Kind.QUOTA))))
        assertFalse(AetherFreeLimit.suppressRecovery(AetherFreeLimit.message(AetherFreeLimit.Notice(AetherFreeLimit.Kind.TEMPORARY, 1))))
        assertFalse(AetherFreeLimit.suppressRecovery("HTTP 429: Too many requests", AetherProvider.config))
    }

    @Test fun `retry after parsing rejects invalid values and accepts numeric and date hints`() {
        assertEquals(90L, retryAfterHeaderSeconds("90"))
        assertEquals(1L, retryAfterHeaderSeconds("0.2"))
        assertEquals(60L, retryAfterHeaderSeconds("Thu, 01 Jan 1970 00:01:00 GMT", 0))
        assertEquals(0L, retryAfterHeaderSeconds("Thu, 01 Jan 1970 00:01:00 GMT", 120_000))
        for (bad in listOf("-1", "NaN", "Infinity", "9999999999999999999", "tomorrow")) assertNull(retryAfterHeaderSeconds(bad))
        assertEquals(15L, providerRetryAfterSeconds(Json.parseToJsonElement("""{"error":{"metadata":{"retryAfterSeconds":"15"}}}""")))
        assertNull(providerRetryAfterSeconds(Json.parseToJsonElement("""{"error":{"metadata":{"retry_after_seconds":-1}}}""")))
        assertNull(AetherFreeLimit.notice("A different provider has insufficient quota"))
    }
}
