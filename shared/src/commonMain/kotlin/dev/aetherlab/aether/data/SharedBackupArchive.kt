package dev.aetherlab.aether.data

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * One-file backup container shared by Android and iOS.
 *
 * The user demanded a single portable file ("save the full data / session into a zip") so a
 * reinstall can never lose chat sessions, settings, providers, skills, extensions or Pi
 * transcripts. This object owns the container format only — the payload stays the existing
 * app-data JSON produced by [SharedAppDataManager.exportJson] on iOS and by the Android data
 * exporter, so no storage semantics are duplicated here.
 *
 * Layout of the archive (ZIP, all entries STORED — no compression, no dependencies):
 *
 *  - `manifest.json`  — format id, schema version, kind, created timestamp, payload entry,
 *                       payload byte length and CRC32, plus the app/package identifiers.
 *  - `app-data.json`  — the full application data document, byte-for-byte as exported.
 *
 * A missing manifest is tolerated on restore (the payload entry is enough), and the reader also
 * accepts DEFLATE entries written by other zip tools when a platform inflater is available.
 */
object SharedBackupArchive {
    const val FormatId: String = "aether-backup"
    const val SchemaVersion: Int = 1
    const val ManifestEntryName: String = "manifest.json"
    const val PayloadEntryName: String = "app-data.json"

    /** Suggested file name for a backup created at [createdAtMillis]. */
    fun suggestedFileName(createdAtMillis: Long, label: String = ""): String {
        val stamp = compactTimestamp(createdAtMillis)
        val suffix = label.trim().let { if (it.isEmpty()) "" else "-" + it.replace(Regex("[^A-Za-z0-9._-]+"), "-") }
        return "aether-backup-$stamp$suffix.zip"
    }

    /** ZIP local-file-header magic. Used to tell a new archive from a legacy raw JSON export. */
    fun looksLikeZip(bytes: ByteArray): Boolean =
        bytes.size >= 4 &&
            bytes[0] == 'P'.code.toByte() &&
            bytes[1] == 'K'.code.toByte() &&
            bytes[2] == 3.toByte() &&
            bytes[3] == 4.toByte()

    /**
     * Builds a backup archive around [payloadJson].
     *
     * @param kind short payload identifier, e.g. `android-app-data` or `ios-app-data`.
     * @param createdAtMillis archive timestamp; also used for the manifest.
     * @param packageName optional application id for diagnostics and for cross-build warnings.
     * @param buildType optional Gradle build type (`debug`, `nightly`, `release`, …).
     * @param appVersionName optional human readable version.
     * @param extraEntries additional files placed next to the payload (e.g. per-session data).
     */
    fun build(
        payloadJson: String,
        kind: String,
        createdAtMillis: Long,
        packageName: String = "",
        buildType: String = "",
        appVersionName: String = "",
        extraEntries: Map<String, ByteArray> = emptyMap(),
    ): ByteArray {
        val payload = payloadJson.encodeToByteArray()
        val entries = LinkedHashMap<String, ByteArray>()
        entries[ManifestEntryName] = buildManifest(
            kind = kind,
            createdAtMillis = createdAtMillis,
            payloadBytes = payload.size,
            payloadCrc = crc32(payload),
            packageName = packageName,
            buildType = buildType,
            appVersionName = appVersionName,
            extraEntryNames = extraEntries.keys.toList(),
        ).encodeToByteArray()
        entries[PayloadEntryName] = payload
        entries.putAll(extraEntries)
        return writeZip(entries, createdAtMillis)
    }

    /**
     * Extracts the app-data JSON document from a backup archive.
     *
     * Returns `null` when [bytes] is not a zip archive at all, so callers can fall back to the
     * legacy plain-JSON import path instead of failing.
     */
    fun extractPayload(bytes: ByteArray): String? {
        if (!looksLikeZip(bytes)) return null
        val entries = readZip(bytes)
        entries[PayloadEntryName]?.let { return it.decodeToString() }
        // Tolerate renamed payloads: any other *.json entry that is not the manifest.
        entries.entries
            .firstOrNull { (name, _) -> name.endsWith(".json", ignoreCase = true) && name != ManifestEntryName }
            ?.let { return it.value.decodeToString() }
        error("The archive does not contain an Aether data document.")
    }

    /** Reads the manifest as text, when present. Used for compatibility warnings. */
    fun extractManifest(bytes: ByteArray): String? {
        if (!looksLikeZip(bytes)) return null
        return readZip(bytes)[ManifestEntryName]?.decodeToString()
    }

    private fun buildManifest(
        kind: String,
        createdAtMillis: Long,
        payloadBytes: Int,
        payloadCrc: Long,
        packageName: String,
        buildType: String,
        appVersionName: String,
        extraEntryNames: List<String>,
    ): String {
        val manifest: JsonObject = buildJsonObject {
            put("format", FormatId)
            put("schemaVersion", SchemaVersion)
            put("kind", kind)
            put("createdAtMillis", createdAtMillis)
            put("payloadEntry", PayloadEntryName)
            put("payloadBytes", payloadBytes)
            put("payloadCrc32", payloadCrc)
            put("packageName", packageName)
            put("buildType", buildType)
            put("appVersionName", appVersionName)
            put("extraEntries", extraEntryNames.size)
        }
        return manifest.toString()
    }

    private fun compactTimestamp(millis: Long): String {
        // Manual UTC breakdown keeps this dependency-free and identical on both platforms.
        var days = millis / 86_400_000L
        var remainder = millis % 86_400_000L
        if (remainder < 0) {
            remainder += 86_400_000L
            days -= 1
        }
        val millisOfDay = remainder
        val hour = (millisOfDay / 3_600_000L).toInt()
        val minute = ((millisOfDay % 3_600_000L) / 60_000L).toInt()
        val second = ((millisOfDay % 60_000L) / 1000L).toInt()
        val (year, month, day) = civilFromDays(days)
        return buildString {
            append(year.toString().padStart(4, '0'))
            append(month.toString().padStart(2, '0'))
            append(day.toString().padStart(2, '0'))
            append('-')
            append(hour.toString().padStart(2, '0'))
            append(minute.toString().padStart(2, '0'))
            append(second.toString().padStart(2, '0'))
        }
    }

    /** Days since 1970-01-01 to proleptic Gregorian civil date (Howard Hinnant's algorithm). */
    private fun civilFromDays(daysSinceEpoch: Long): Triple<Long, Long, Long> {
        val z = daysSinceEpoch + 719_468L
        val era = if (z >= 0) z / 146_097L else (z - 146_096L) / 146_097L
        val dayOfEra = z - era * 146_097L
        val yearOfEra = (dayOfEra - dayOfEra / 1460L + dayOfEra / 36_524L - dayOfEra / 146_096L) / 365L
        var year = yearOfEra + era * 400L
        val dayOfYear = dayOfEra - (365L * yearOfEra + yearOfEra / 4L - yearOfEra / 100L)
        val mp = (5L * dayOfYear + 2L) / 153L
        val day = dayOfYear - (153L * mp + 2L) / 5L + 1L
        val month = if (mp < 10L) mp + 3L else mp - 9L
        if (month <= 2L) year += 1L
        return Triple(year, month, day)
    }

    // ---- ZIP (STORED) writer -------------------------------------------------

    private const val LocalHeaderSignature = 0x04034b50
    private const val CentralHeaderSignature = 0x02014b50
    private const val EndOfCentralDirectorySignature = 0x06054b50
    private const val VersionNeeded = 20
    private const val Utf8Flag = 0x0800
    private const val MethodStored = 0
    private const val MethodDeflate = 8

    private fun writeZip(entries: Map<String, ByteArray>, createdAtMillis: Long): ByteArray {
        val out = ZipSink()
        val central = ZipSink()
        val (dosTime, dosDate) = dosDateTime(createdAtMillis)
        var count = 0
        for ((name, data) in entries) {
            val nameBytes = name.encodeToByteArray()
            val crc = crc32(data)
            val offset = out.size
            out.intLE(LocalHeaderSignature)
            out.shortLE(VersionNeeded)
            out.shortLE(Utf8Flag)
            out.shortLE(MethodStored)
            out.shortLE(dosTime)
            out.shortLE(dosDate)
            out.intLE(crc.toInt())
            out.intLE(data.size)
            out.intLE(data.size)
            out.shortLE(nameBytes.size)
            out.shortLE(0)
            out.raw(nameBytes)
            out.raw(data)

            central.intLE(CentralHeaderSignature)
            central.shortLE(VersionNeeded)
            central.shortLE(VersionNeeded)
            central.shortLE(Utf8Flag)
            central.shortLE(MethodStored)
            central.shortLE(dosTime)
            central.shortLE(dosDate)
            central.intLE(crc.toInt())
            central.intLE(data.size)
            central.intLE(data.size)
            central.shortLE(nameBytes.size)
            central.shortLE(0)
            central.shortLE(0)
            central.shortLE(0)
            central.shortLE(0)
            central.intLE(0)
            central.intLE(offset)
            central.raw(nameBytes)
            count += 1
        }
        val centralOffset = out.size
        out.raw(central.toByteArray())
        val centralSize = out.size - centralOffset
        out.intLE(EndOfCentralDirectorySignature)
        out.shortLE(0)
        out.shortLE(0)
        out.shortLE(count)
        out.shortLE(count)
        out.intLE(centralSize)
        out.intLE(centralOffset)
        out.shortLE(0)
        return out.toByteArray()
    }

    private fun dosDateTime(millis: Long): Pair<Int, Int> {
        var days = millis / 86_400_000L
        var remainder = millis % 86_400_000L
        if (remainder < 0) {
            remainder += 86_400_000L
            days -= 1
        }
        val (year, month, day) = civilFromDays(days)
        val hour = (remainder / 3_600_000L).toInt()
        val minute = ((remainder % 3_600_000L) / 60_000L).toInt()
        val second = ((remainder % 60_000L) / 1000L).toInt()
        val dosDate = (((year - 1980L).toInt().coerceIn(0, 127)) shl 9) or (month.toInt() shl 5) or day.toInt()
        val dosTime = (hour shl 11) or (minute shl 5) or (second / 2)
        return dosTime to dosDate
    }

    // ---- ZIP reader ---------------------------------------------------------

    private fun readZip(bytes: ByteArray): Map<String, ByteArray> {
        val eocd = findEndOfCentralDirectory(bytes)
        val entryCount = bytes.readShortLE(eocd + 10)
        var cursor = bytes.readIntLE(eocd + 16)
        val result = LinkedHashMap<String, ByteArray>()
        repeat(entryCount) {
            require(cursor >= 0 && cursor + 46 <= bytes.size) { "Corrupt zip archive: bad central directory offset." }
            require(bytes.readIntLE(cursor) == CentralHeaderSignature) { "Corrupt zip archive: bad central directory entry." }
            val method = bytes.readShortLE(cursor + 10)
            val crc = bytes.readIntLE(cursor + 16).toLong() and 0xFFFF_FFFFL
            val compressedSize = bytes.readIntLE(cursor + 20)
            val uncompressedSize = bytes.readIntLE(cursor + 24)
            val nameLength = bytes.readShortLE(cursor + 28)
            val extraLength = bytes.readShortLE(cursor + 30)
            val commentLength = bytes.readShortLE(cursor + 32)
            val localOffset = bytes.readIntLE(cursor + 42)
            val name = bytes.copyOfRange(cursor + 46, cursor + 46 + nameLength).decodeToString()
            require(localOffset + 30 <= bytes.size) { "Corrupt zip archive: bad local header offset." }
            require(bytes.readIntLE(localOffset) == LocalHeaderSignature) { "Corrupt zip archive: bad local header." }
            val localNameLength = bytes.readShortLE(localOffset + 26)
            val localExtraLength = bytes.readShortLE(localOffset + 28)
            val dataOffset = localOffset + 30 + localNameLength + localExtraLength
            val dataEnd = dataOffset + compressedSize
            require(dataEnd <= bytes.size) { "Corrupt zip archive: entry data out of range." }
            val raw = bytes.copyOfRange(dataOffset, dataEnd)
            val data = when (method) {
                MethodStored -> raw
                MethodDeflate -> inflate(raw, uncompressedSize)
                else -> error("Unsupported zip compression method $method for $name.")
            }
            if (method == MethodStored && crc != 0L && crc32(data) != crc) {
                error("The archive entry $name is damaged (checksum mismatch).")
            }
            result[name] = data
            cursor += 46 + nameLength + extraLength + commentLength
        }
        return result
    }

    private fun findEndOfCentralDirectory(bytes: ByteArray): Int {
        val minimum = 22
        require(bytes.size >= minimum) { "Not a zip archive." }
        val lowest = maxOf(0, bytes.size - minimum - 0xFFFF)
        var index = bytes.size - minimum
        while (index >= lowest) {
            if (bytes.readIntLE(index) == EndOfCentralDirectorySignature) return index
            index -= 1
        }
        error("Not a zip archive: end of central directory not found.")
    }

    /**
     * DEFLATE entries are rejected explicitly: this object always writes STORED entries, and a
     * platform inflater would fork the container between Android and iOS. A clear message beats
     * a silently different archive on one platform.
     */
    private fun inflate(raw: ByteArray, expectedSize: Int): ByteArray =
        error(
            "This archive is compressed (DEFLATE, ${raw.size} bytes -> $expectedSize bytes). " +
                "Aether backups are stored uncompressed; export a fresh backup from Aether instead.",
        )

    private fun ByteArray.readShortLE(offset: Int): Int =
        (this[offset].toInt() and 0xFF) or ((this[offset + 1].toInt() and 0xFF) shl 8)

    private fun ByteArray.readIntLE(offset: Int): Int =
        (this[offset].toInt() and 0xFF) or
            ((this[offset + 1].toInt() and 0xFF) shl 8) or
            ((this[offset + 2].toInt() and 0xFF) shl 16) or
            ((this[offset + 3].toInt() and 0xFF) shl 24)

    // ---- CRC32 --------------------------------------------------------------

    private val crcTable: IntArray by lazy {
        IntArray(256) { index ->
            var value = index
            repeat(8) {
                value = if (value and 1 != 0) (value ushr 1) xor 0xEDB88320.toInt() else value ushr 1
            }
            value
        }
    }

    fun crc32(bytes: ByteArray): Long {
        var crc = -1
        for (byte in bytes) {
            crc = (crc ushr 8) xor crcTable[(crc xor byte.toInt()) and 0xFF]
        }
        return (crc.inv().toLong() and 0xFFFF_FFFFL)
    }

    // ---- Byte sink ----------------------------------------------------------

    private class ZipSink {
        private var buffer = ByteArray(4096)
        var size: Int = 0
            private set

        private fun ensure(extra: Int) {
            if (size + extra <= buffer.size) return
            var nextSize = buffer.size
            while (nextSize < size + extra) nextSize *= 2
            buffer = buffer.copyOf(nextSize)
        }

        fun byte(value: Int) {
            ensure(1)
            buffer[size] = value.toByte()
            size += 1
        }

        fun shortLE(value: Int) {
            byte(value and 0xFF)
            byte((value ushr 8) and 0xFF)
        }

        fun intLE(value: Int) {
            shortLE(value and 0xFFFF)
            shortLE((value ushr 16) and 0xFFFF)
        }

        fun raw(value: ByteArray) {
            ensure(value.size)
            value.copyInto(buffer, size)
            size += value.size
        }

        fun toByteArray(): ByteArray = buffer.copyOf(size)
    }
}