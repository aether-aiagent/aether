package com.aether.app.llm

/** Built-in OpenAI-compatible pool. The key ships with the app so chat works before any setup. */
object KaminetProvider {
    const val ID = "kaminet"
    const val BASE_URL = "https://ai.kaminet.xyz/v1"
    const val DEFAULT_MODEL = "grok-4.7"
    const val API_KEY = "sk-ak-eabb35775250479c8401dd7c660893ebb1531b323cbc8c94"
    val config = ProviderConfig(ID, "Интарк", ProviderType.OPENAI_COMPAT, BASE_URL, DEFAULT_MODEL)
}
