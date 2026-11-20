package dev.aetherlab.aether.data.pi

import io.ktor.client.HttpClient

internal expect fun createChromeHttpClient(): HttpClient
