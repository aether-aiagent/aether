package dev.aetherlab.aether.data

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class SharedBackupArchiveTest {
    private val payload = """
        {
          "schemaVersion": 3,
          "sessions": [{"id": "s1", "messages": [{"text": "привет"}]}],
          "settings": {"defaultRuntimeId": "alpine"}
        }
    """.trimIndent()

    @Test
    fun crc32MatchesTheStandardVector() {
        assertEquals(0x3610A686L, SharedBackupArchive.crc32("hello".encodeToByteArray()))
        assertEquals(0L, SharedBackupArchive.crc32(ByteArray(0)))
    }

    @Test
    fun roundTripKeepsThePayloadByteForByte() {
        val archive = SharedBackupArchive.build(
            payloadJson = payload,
            kind = "test",
            createdAtMillis = 1_700_000_000_000L,
            packageName = "dev.aetherlab.aether.debug",
            buildType = "debug",
            appVersionName = "1.0-test",
        )
        assertTrue(SharedBackupArchive.looksLikeZip(archive))
        // A zip must start with the local file header magic.
        assertEquals('P'.code.toByte(), archive[0])
        assertEquals('K'.code.toByte(), archive[1])
        assertEquals(SharedBackupArchive.extractPayload(archive), payload)
    }

    @Test
    fun manifestDescribesTheContainer() {
        val archive = SharedBackupArchive.build(
            payloadJson = payload,
            kind = "android-app-data",
            createdAtMillis = 1_700_000_000_000L,
            packageName = "dev.aetherlab.aether",
            buildType = "nightly",
            appVersionName = "Nightly abc123",
        )
        val manifest = SharedBackupArchive.extractManifest(archive)
        assertNotNull(manifest)
        assertTrue(manifest!!.contains("\"format\":\"${SharedBackupArchive.FormatId}\""))
        assertTrue(manifest.contains("\"schemaVersion\":${SharedBackupArchive.SchemaVersion}"))
        assertTrue(manifest.contains("\"kind\":\"android-app-data\""))
        assertTrue(manifest.contains("\"buildType\":\"nightly\""))
        assertTrue(
            manifest.contains("\"payloadCrc32\":${SharedBackupArchive.crc32(payload.encodeToByteArray())}"),
        )
    }

    @Test
    fun extraEntriesDoNotShadowThePayload() {
        val archive = SharedBackupArchive.build(
            payloadJson = payload,
            kind = "test",
            createdAtMillis = 1L,
            extraEntries = mapOf("transcripts/s1.jsonl" to "line1\nline2\n".encodeToByteArray()),
        )
        assertEquals(payload, SharedBackupArchive.extractPayload(archive))
    }

    @Test
    fun emptyAndLargePayloadsSurvive() {
        val empty = SharedBackupArchive.build(payloadJson = "{}", kind = "test", createdAtMillis = 0L)
        assertEquals("{}", SharedBackupArchive.extractPayload(empty))

        // Crosses the internal 4096-byte sink growth boundary several times.
        val large = buildString {
            append("{\"data\":\"")
            repeat(20_000) { append('x') }
            append("\"}")
        }
        val largeArchive = SharedBackupArchive.build(
            payloadJson = large,
            kind = "test",
            createdAtMillis = 0L,
        )
        assertEquals(large, SharedBackupArchive.extractPayload(largeArchive))
    }

    @Test
    fun legacyJsonIsRejectedAsZipSoImportCanFallBack() {
        val legacy = payload.encodeToByteArray()
        assertFalse(SharedBackupArchive.looksLikeZip(legacy))
        assertEquals(null, SharedBackupArchive.extractPayload(legacy))
        assertEquals(null, SharedBackupArchive.extractManifest(legacy))
    }

    @Test
    fun corruptArchivesFailLoudly() {
        val archive = SharedBackupArchive.build(payloadJson = payload, kind = "test", createdAtMillis = 5L)
        // Truncating the tail removes the end-of-central-directory record.
        val truncated = archive.copyOfRange(0, archive.size - 10)
        assertTrue(runCatching { SharedBackupArchive.extractPayload(truncated) }.isFailure)

        // Flipping a payload byte must trip the checksum instead of silently restoring garbage.
        val needle = payload.encodeToByteArray()
        val start = indexOfBytes(archive, needle)
        assertTrue(start >= 0, "payload must be stored verbatim inside the archive")
        val damaged = archive.copyOf()
        damaged[start + 5] = (damaged[start + 5].toInt() xor 0xFF).toByte()
        assertTrue(runCatching { SharedBackupArchive.extractPayload(damaged) }.isFailure)
    }

    private fun indexOfBytes(haystack: ByteArray, needle: ByteArray): Int {
        if (needle.isEmpty() || needle.size > haystack.size) return -1
        for (start in 0..(haystack.size - needle.size)) {
            var matched = true
            for (offset in needle.indices) {
                if (haystack[start + offset] != needle[offset]) {
                    matched = false
                    break
                }
            }
            if (matched) return start
        }
        return -1
    }

    @Test
    fun suggestedFileNameIsFilesystemSafe() {
        val name = SharedBackupArchive.suggestedFileName(1_700_000_000_000L)
        assertTrue(name.startsWith("aether-backup-"))
        assertTrue(name.endsWith(".zip"))
        assertFalse(name.contains('/'))
        assertFalse(name.contains(':'))
        assertTrue(SharedBackupArchive.suggestedFileName(0L, "debug build!").endsWith("-debug-build-.zip"))
    }
}