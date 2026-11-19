package dev.aetherlab.aether.ui

import kotlin.test.Test
import kotlin.test.assertEquals

class AetherPollReplyTest {
    private val poll = AetherPoll(
        question = "Which runtime?",
        options = listOf(
            AetherPollOption(id = "a", label = "Alpine"),
            AetherPollOption(id = "b", label = "Termux"),
        ),
        multiple = true,
    )

    @Test
    fun selectedOptionsReplyIsUnchangedWithoutCustomText() {
        assertEquals(
            "Poll: Which runtime? → Alpine, Termux",
            buildAetherPollAnswerReply(poll, "Poll", listOf("a", "b")),
        )
        assertEquals(
            "Poll: Which runtime? → Alpine, Termux",
            buildAetherPollAnswerReply(poll, "Poll", listOf("a", "b"), customText = null),
        )
    }

    @Test
    fun customTextIsTrimmedAndTakesPrecedenceOverSelection() {
        assertEquals(
            "Опрос: Which runtime? → мой вариант",
            buildAetherPollAnswerReply(poll, "Опрос", listOf("a"), customText = "  мой вариант \n"),
        )
    }

    @Test
    fun blankCustomTextFallsBackToSelectionThenHeader() {
        assertEquals(
            "Poll: Which runtime? → Termux",
            buildAetherPollAnswerReply(poll, "Poll", listOf("b"), customText = "   "),
        )
        assertEquals(
            "Poll: Which runtime?",
            buildAetherPollAnswerReply(poll, "Poll", emptyList(), customText = "  "),
        )
        assertEquals(
            "Poll: Which runtime?",
            buildAetherPollAnswerReply(poll, "Poll", emptyList()),
        )
    }
}