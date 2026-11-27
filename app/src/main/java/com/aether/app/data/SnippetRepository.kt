package com.aether.app.data

import com.aether.app.data.db.AetherDao
import com.aether.app.data.db.SnippetEntity
import kotlinx.coroutines.flow.Flow
import java.util.UUID

/** User-saved prompt snippets, invokable as custom slash commands. */
class SnippetRepository(private val dao: AetherDao) {
    val snippets: Flow<List<SnippetEntity>> = dao.snippetsFlow()

    suspend fun add(name: String, body: String) {
        dao.insertSnippet(SnippetEntity(UUID.randomUUID().toString(), name.trim(), body.trim()))
    }

    suspend fun delete(snippet: SnippetEntity) {
        dao.deleteSnippet(snippet)
    }
}
