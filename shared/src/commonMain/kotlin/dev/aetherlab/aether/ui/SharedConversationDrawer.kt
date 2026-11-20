package dev.aetherlab.aether.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.MutableTransitionState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import dev.aetherlab.aether.shared.resources.Res
import dev.aetherlab.aether.shared.resources.chat_no_conversations_yet
import dev.aetherlab.aether.shared.resources.common_cancel
import dev.aetherlab.aether.shared.resources.common_chat
import dev.aetherlab.aether.shared.resources.common_delete
import dev.aetherlab.aether.shared.resources.common_export
import dev.aetherlab.aether.shared.resources.common_new_chat
import dev.aetherlab.aether.shared.resources.common_rename
import dev.aetherlab.aether.shared.resources.common_search
import dev.aetherlab.aether.shared.resources.drawer_filter_all
import dev.aetherlab.aether.shared.resources.drawer_filter_older
import dev.aetherlab.aether.shared.resources.drawer_filter_today
import dev.aetherlab.aether.shared.resources.drawer_filter_week
import dev.aetherlab.aether.shared.resources.drawer_folder_create
import dev.aetherlab.aether.shared.resources.drawer_folder_move
import dev.aetherlab.aether.shared.resources.drawer_folder_new
import dev.aetherlab.aether.shared.resources.drawer_folder_none
import dev.aetherlab.aether.shared.resources.drawer_group_earlier
import dev.aetherlab.aether.shared.resources.drawer_group_today
import dev.aetherlab.aether.shared.resources.drawer_group_yesterday
import dev.aetherlab.aether.shared.resources.search_no_chats_match
import dev.aetherlab.aether.shared.resources.settings_title
import dev.aetherlab.aether.ui.theme.AetherOnSurface
import dev.aetherlab.aether.ui.theme.AetherOnSurfaceVariant
import dev.aetherlab.aether.ui.theme.AetherBackground
import dev.aetherlab.aether.ui.theme.AetherPrimary
import dev.aetherlab.aether.ui.theme.AetherPrimaryContainer
import dev.aetherlab.aether.ui.theme.AetherScrim
import dev.aetherlab.aether.ui.theme.AetherSidebarBackground
import dev.aetherlab.aether.ui.theme.AetherSurface
import dev.aetherlab.aether.ui.theme.AetherSurfaceHigh
import kotlinx.coroutines.delay
import org.jetbrains.compose.resources.stringResource
import kotlin.math.roundToInt

data class SharedConversationSummary(
    val id: String,
    val title: String,
    val indicator: SharedConversationIndicator = SharedConversationIndicator.None,
    /** Pre-formatted clock time or short date shown on the right side of the row. */
    val stampLabel: String = "",
    /** 0 = today, 1 = yesterday, 2 = earlier. Drives the day headers in the list. */
    val dayBucket: Int = 2,
    /** How many whole days passed since the last message. Drives the age filter chips. */
    val ageDays: Int = Int.MAX_VALUE,
)

enum class SharedConversationIndicator {
    None,
    Working,
    UnviewedComplete,
}

data class SharedDrawerFolder(
    val id: String,
    val name: String,
)

enum class SharedDrawerSwipeAction {
    None,
    Export,
    Trash,
}

enum class SharedDrawerFilter {
    All,
    Today,
    Week,
    Older,
}

private sealed interface SharedDrawerEntry {
    data class Header(val bucket: Int) : SharedDrawerEntry
    data class Session(val summary: SharedConversationSummary) : SharedDrawerEntry
}

private val SharedDrawerOverlayFadeHeight = 18.dp
private val SharedDrawerSwipeLimit = 168f
private val SharedDrawerSwipeThreshold = 96f

private fun SharedConversationSummary.matchesAgeFilter(filter: SharedDrawerFilter): Boolean =
    when (filter) {
        SharedDrawerFilter.All -> true
        SharedDrawerFilter.Today -> ageDays < 1
        SharedDrawerFilter.Week -> ageDays < 7
        SharedDrawerFilter.Older -> ageDays >= 7
    }

private fun sharedDrawerEntries(sessions: List<SharedConversationSummary>): List<SharedDrawerEntry> {
    val entries = ArrayList<SharedDrawerEntry>(sessions.size + 3)
    var currentBucket = -1
    sessions.forEach { session ->
        if (session.dayBucket != currentBucket) {
            currentBucket = session.dayBucket
            entries.add(SharedDrawerEntry.Header(currentBucket))
        }
        entries.add(SharedDrawerEntry.Session(session))
    }
    return entries
}

private fun sharedDrawerAvatarTint(seed: String): Color {
    val palette = listOf(
        Color(0xFF6E8DFB),
        Color(0xFF9C7BF6),
        Color(0xFF45B7A6),
        Color(0xFFE08A5C),
        Color(0xFFC86BB0),
        Color(0xFF4FA3D9),
    )
    val index = (seed.fold(7) { acc, ch -> (acc * 31 + ch.code) and 0x7FFFFFFF } % palette.size)
    return palette[index]
}

@Composable
fun AetherConversationDrawer(
    sessions: List<SharedConversationSummary>,
    selectedSessionId: String,
    onNewChat: () -> Unit,
    onSessionSelected: (String) -> Unit,
    onRenameSession: (String, String) -> Unit,
    onExportSession: (String) -> Unit,
    onDeleteSession: (String) -> Unit,
    onSettingsSelected: () -> Unit,
    permanent: Boolean = false,
    extraContent: @Composable ((dismissSearch: () -> Unit) -> Unit) = {},
    headerContent: @Composable () -> Unit = {},
    footerContent: @Composable () -> Unit = {},
    folders: List<SharedDrawerFolder> = emptyList(),
    sessionFolderIds: Map<String, String> = emptyMap(),
    onAssignFolder: ((sessionId: String, folderId: String?) -> Unit)? = null,
    onCreateFolder: ((String) -> Unit)? = null,
    swipeStartAction: SharedDrawerSwipeAction = SharedDrawerSwipeAction.None,
    swipeEndAction: SharedDrawerSwipeAction = SharedDrawerSwipeAction.None,
) {
    var searchExpanded by rememberSaveable { mutableStateOf(false) }
    var searchQuery by rememberSaveable { mutableStateOf("") }
    var activeFilterName by rememberSaveable { mutableStateOf(SharedDrawerFilter.All.name) }
    var activeFolderId by rememberSaveable { mutableStateOf("") }
    var creatingFolder by remember { mutableStateOf(false) }
    var overlayHeightPx by remember { mutableIntStateOf(0) }
    var footerHeightPx by remember { mutableIntStateOf(0) }
    val density = LocalDensity.current
    val activeFilter = SharedDrawerFilter.entries
        .firstOrNull { it.name == activeFilterName } ?: SharedDrawerFilter.All
    val overlayHeight = with(density) {
        if (overlayHeightPx > 0) overlayHeightPx.toDp() else 132.dp
    }
    val listBottomPadding = 96.dp + with(density) { footerHeightPx.toDp() }
    val filteredSessions = remember(sessions, searchQuery, activeFilter, activeFolderId, sessionFolderIds) {
        val query = searchQuery.trim().lowercase()
        sessions.filter { session ->
            val folderOk = activeFolderId.isEmpty() || sessionFolderIds[session.id] == activeFolderId
            folderOk &&
                session.matchesAgeFilter(activeFilter) &&
                (query.isBlank() || session.title.lowercase().contains(query) ||
                    session.stampLabel.lowercase().contains(query))
        }
    }
    val entries = remember(filteredSessions) { sharedDrawerEntries(filteredSessions) }
    val dismissSearch = {
        searchExpanded = false
        searchQuery = ""
    }
    val drawerBackground = if (permanent) AetherBackground else AetherSidebarBackground

    ModalDrawerSheet(
        modifier = Modifier.fillMaxHeight().width(if (permanent) 320.dp else 322.dp),
        drawerContainerColor = drawerBackground,
        drawerShape = if (permanent) RoundedCornerShape(0.dp) else {
            RoundedCornerShape(topEnd = 30.dp, bottomEnd = 30.dp)
        },
    ) {
        Box(modifier = Modifier.fillMaxSize().padding(bottom = 18.dp)) {
            if (filteredSessions.isEmpty()) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(
                            start = 16.dp,
                            end = 16.dp,
                            top = overlayHeight - SharedDrawerOverlayFadeHeight,
                            bottom = listBottomPadding,
                        ),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    if (sessions.isNotEmpty()) {
                        SharedDrawerFolderChips(
                            folders = folders,
                            activeFolderId = activeFolderId,
                            onFolderSelected = { activeFolderId = it },
                            onCreateFolder = { creatingFolder = true },
                        )
                        SharedDrawerFilterChips(
                            activeFilter = activeFilter,
                            onFilterSelected = { activeFilterName = it.name },
                        )
                    }
                    Text(
                        text = stringResource(
                            if (sessions.isEmpty()) {
                                Res.string.chat_no_conversations_yet
                            } else {
                                Res.string.search_no_chats_match
                            }
                        ),
                        style = MaterialTheme.typography.bodyMedium,
                        color = AetherOnSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 4.dp, vertical = 8.dp),
                    )
                    extraContent(dismissSearch)
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(
                        start = 16.dp,
                        end = 16.dp,
                        top = overlayHeight - SharedDrawerOverlayFadeHeight,
                        bottom = listBottomPadding,
                    ),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    item(key = "aether-drawer-folders") {
                        Column {
                            SharedDrawerFolderChips(
                                folders = folders,
                                activeFolderId = activeFolderId,
                                onFolderSelected = { activeFolderId = it },
                                onCreateFolder = { creatingFolder = true },
                            )
                            SharedDrawerFilterChips(
                                activeFilter = activeFilter,
                                onFilterSelected = { activeFilterName = it.name },
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                        }
                    }
                    items(entries, key = { entry ->
                        when (entry) {
                            is SharedDrawerEntry.Header -> "aether-drawer-header-${entry.bucket}"
                            is SharedDrawerEntry.Session -> entry.summary.id
                        }
                    }) { entry ->
                        when (entry) {
                            is SharedDrawerEntry.Header -> SharedDrawerDayHeader(entry.bucket)
                            is SharedDrawerEntry.Session -> SharedDrawerSessionRow(
                                session = entry.summary,
                                selected = entry.summary.id == selectedSessionId,
                                swipedFromStart = swipeStartAction,
                                swipedFromEnd = swipeEndAction,
                                canMoveToFolder = onAssignFolder != null,
                                folders = folders,
                                onClick = {
                                    dismissSearch()
                                    onSessionSelected(entry.summary.id)
                                },
                                onRename = { onRenameSession(entry.summary.id, it) },
                                onExport = { onExportSession(entry.summary.id) },
                                onDelete = { onDeleteSession(entry.summary.id) },
                                onAssignFolder = { folderId ->
                                    onAssignFolder?.invoke(entry.summary.id, folderId)
                                },
                                currentFolderId = sessionFolderIds[entry.summary.id],
                            )
                        }
                    }
                    item(key = "aether-extra-drawer-content") {
                        Column(modifier = Modifier.padding(top = 10.dp)) {
                            extraContent(dismissSearch)
                        }
                    }
                }
            }

            Column(
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .fillMaxWidth()
                    .background(sharedDrawerOverlayBodyGradient(drawerBackground))
                    .onSizeChanged { overlayHeightPx = it.height },
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp)
                        .padding(top = 18.dp)
                        .statusBarsPadding(),
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = "Aether",
                            style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Normal),
                            color = AetherOnSurface,
                            modifier = Modifier.padding(start = 6.dp),
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            HeaderCircleButton(
                                icon = LucideIcons.Search,
                                contentDescription = stringResource(Res.string.common_search),
                                onClick = {
                                    if (searchExpanded || searchQuery.isNotBlank()) dismissSearch()
                                    else searchExpanded = true
                                },
                                size = 46.dp,
                                containerColor = Color.Transparent,
                                showHalo = false,
                            )
                            HeaderCircleButton(
                                icon = LucideIcons.Settings,
                                contentDescription = stringResource(Res.string.settings_title),
                                onClick = {
                                    dismissSearch()
                                    onSettingsSelected()
                                },
                                size = 46.dp,
                                containerColor = Color.Transparent,
                                showHalo = false,
                            )
                        }
                    }
                    AnimatedVisibility(visible = searchExpanded || searchQuery.isNotBlank()) {
                        Column {
                            Spacer(modifier = Modifier.height(16.dp))
                            SharedDrawerSearchField(searchQuery) { searchQuery = it }
                        }
                    }
                    Spacer(modifier = Modifier.height(if (searchExpanded || searchQuery.isNotBlank()) 10.dp else 12.dp))
                }
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp),
                ) {
                    headerContent()
                }
                Spacer(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(SharedDrawerOverlayFadeHeight)
                        .background(sharedDrawerOverlayTailGradient(drawerBackground)),
                )
            }

            Column(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(horizontal = 16.dp)
                    .offset(y = (-86).dp)
                    .onSizeChanged { footerHeightPx = it.height },
            ) {
                footerContent()
            }

            Row(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .navigationBarsPadding()
                    .padding(end = 18.dp, bottom = 18.dp)
                    .shadow(18.dp, RoundedCornerShape(999.dp), ambientColor = AetherScrim, spotColor = AetherScrim)
                    .clip(RoundedCornerShape(999.dp))
                    .background(AetherPrimary)
                    .clickable {
                        dismissSearch()
                        onNewChat()
                    }
                    .padding(horizontal = 16.dp, vertical = 11.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(LucideIcons.SquarePen, null, tint = Color.White, modifier = Modifier.size(17.dp))
                Text(
                    text = stringResource(Res.string.common_chat),
                    style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Medium),
                    color = Color.White,
                )
            }

            if (creatingFolder) {
                SharedDrawerFolderDialog(
                    onDismiss = { creatingFolder = false },
                    onCreate = { name ->
                        creatingFolder = false
                        onCreateFolder?.invoke(name)
                    },
                )
            }
        }
    }
}

@Composable
private fun SharedDrawerDayHeader(bucket: Int) {
    val label = when (bucket) {
        0 -> stringResource(Res.string.drawer_group_today)
        1 -> stringResource(Res.string.drawer_group_yesterday)
        else -> stringResource(Res.string.drawer_group_earlier)
    }
    Text(
        text = label,
        style = MaterialTheme.typography.labelMedium,
        color = AetherOnSurfaceVariant,
        modifier = Modifier.padding(start = 8.dp, top = 12.dp, bottom = 2.dp),
    )
}

@Composable
private fun SharedDrawerFolderChips(
    folders: List<SharedDrawerFolder>,
    activeFolderId: String,
    onFolderSelected: (String) -> Unit,
    onCreateFolder: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        SharedDrawerPill(
            label = stringResource(Res.string.drawer_filter_all),
            active = activeFolderId.isEmpty(),
            onClick = { onFolderSelected("") },
        )
        folders.take(2).forEach { folder ->
            SharedDrawerPill(
                label = folder.name,
                active = activeFolderId == folder.id,
                onClick = { onFolderSelected(folder.id) },
            )
        }
        SharedDrawerPill(
            label = "+",
            active = false,
            onClick = onCreateFolder,
        )
    }
}

@Composable
private fun SharedDrawerFilterChips(
    activeFilter: SharedDrawerFilter,
    onFilterSelected: (SharedDrawerFilter) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        SharedDrawerFilter.entries.forEach { filter ->
            SharedDrawerPill(
                label = when (filter) {
                    SharedDrawerFilter.All -> stringResource(Res.string.drawer_filter_all)
                    SharedDrawerFilter.Today -> stringResource(Res.string.drawer_filter_today)
                    SharedDrawerFilter.Week -> stringResource(Res.string.drawer_filter_week)
                    SharedDrawerFilter.Older -> stringResource(Res.string.drawer_filter_older)
                },
                active = filter == activeFilter,
                onClick = { onFilterSelected(filter) },
            )
        }
    }
}

@Composable
private fun SharedDrawerPill(
    label: String,
    active: Boolean,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(if (active) AetherPrimaryContainer else AetherSurfaceHigh)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 6.dp),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = if (active) Color.White else AetherOnSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun SharedDrawerFolderDialog(
    onDismiss: () -> Unit,
    onCreate: (String) -> Unit,
) {
    var name by remember { mutableStateOf("") }
    Popup(
        alignment = Alignment.Center,
        onDismissRequest = onDismiss,
        properties = PopupProperties(focusable = true, dismissOnClickOutside = true),
    ) {
        Column(
            modifier = Modifier
                .widthIn(min = 240.dp, max = 300.dp)
                .shadow(20.dp, RoundedCornerShape(24.dp), ambientColor = AetherScrim, spotColor = AetherScrim)
                .clip(RoundedCornerShape(24.dp))
                .background(AetherSurface)
                .padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = stringResource(Res.string.drawer_folder_new),
                style = MaterialTheme.typography.titleSmall,
                color = AetherOnSurface,
            )
            BasicTextField(
                value = name,
                onValueChange = { name = it },
                singleLine = true,
                textStyle = MaterialTheme.typography.bodyMedium.copy(color = AetherOnSurface),
                cursorBrush = SolidColor(AetherPrimary),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { if (name.isNotBlank()) onCreate(name.trim()) }),
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(AetherSurfaceHigh)
                    .padding(horizontal = 12.dp, vertical = 10.dp),
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
            ) {
                Text(
                    text = stringResource(Res.string.common_cancel),
                    style = MaterialTheme.typography.labelLarge,
                    color = AetherOnSurfaceVariant,
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .clickable(onClick = onDismiss)
                        .padding(horizontal = 14.dp, vertical = 8.dp),
                )
                Text(
                    text = stringResource(Res.string.drawer_folder_create),
                    style = MaterialTheme.typography.labelLarge,
                    color = AetherPrimary,
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .clickable(enabled = name.isNotBlank()) { onCreate(name.trim()) }
                        .padding(horizontal = 14.dp, vertical = 8.dp),
                )
            }
        }
    }
}

@Composable
private fun SharedDrawerSearchField(value: String, onValueChange: (String) -> Unit) {
    Row(
        modifier = Modifier
            .shadow(12.dp, RoundedCornerShape(24.dp), ambientColor = AetherScrim, spotColor = AetherScrim)
            .clip(RoundedCornerShape(24.dp))
            .background(AetherSurface)
            .padding(horizontal = 14.dp, vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(LucideIcons.Search, null, tint = AetherOnSurfaceVariant, modifier = Modifier.size(18.dp))
        Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
            if (value.isBlank()) {
                Text(
                    stringResource(Res.string.common_search),
                    style = MaterialTheme.typography.bodyMedium,
                    color = AetherOnSurfaceVariant,
                )
            }
            BasicTextField(
                value = value,
                onValueChange = onValueChange,
                singleLine = true,
                textStyle = MaterialTheme.typography.bodyMedium.copy(color = AetherOnSurface),
                cursorBrush = SolidColor(AetherOnSurface),
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun SharedDrawerSessionRow(
    session: SharedConversationSummary,
    selected: Boolean,
    swipedFromStart: SharedDrawerSwipeAction,
    swipedFromEnd: SharedDrawerSwipeAction,
    canMoveToFolder: Boolean,
    folders: List<SharedDrawerFolder>,
    currentFolderId: String?,
    onClick: () -> Unit,
    onRename: (String) -> Unit,
    onExport: () -> Unit,
    onDelete: () -> Unit,
    onAssignFolder: (String?) -> Unit,
) {
    val newChatTitle = stringResource(Res.string.common_new_chat)
    var menuExpanded by remember { mutableStateOf(false) }
    var folderPickerExpanded by remember { mutableStateOf(false) }
    var isRenaming by remember { mutableStateOf(false) }
    var renameFieldHadFocus by remember { mutableStateOf(false) }
    var renameFocusRequest by remember { mutableIntStateOf(0) }
    var dragOffset by remember(session.id) { mutableStateOf(0f) }
    var titleValue by remember(session.id, session.title, newChatTitle) {
        mutableStateOf(session.title.ifBlank { newChatTitle })
    }
    val focusRequester = remember { FocusRequester() }
    val keyboard = LocalSoftwareKeyboardController.current

    fun commitRename() {
        titleValue.trim().takeIf { it.isNotBlank() && it != session.title }?.let(onRename)
        isRenaming = false
        keyboard?.hide()
    }

    fun performSwipe(action: SharedDrawerSwipeAction) {
        when (action) {
            SharedDrawerSwipeAction.None -> Unit
            SharedDrawerSwipeAction.Export -> onExport()
            SharedDrawerSwipeAction.Trash -> onDelete()
        }
    }

    LaunchedEffect(renameFocusRequest, isRenaming) {
        if (renameFocusRequest > 0 && isRenaming) {
            delay(260)
            if (isRenaming) {
                focusRequester.requestFocus()
                keyboard?.show()
            }
        }
    }

    Box {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(18.dp))
                .background(AetherSurfaceHigh.copy(alpha = 0.55f))
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            if (swipedFromStart != SharedDrawerSwipeAction.None) {
                Text(
                    text = if (swipedFromStart == SharedDrawerSwipeAction.Trash) {
                        stringResource(Res.string.common_delete)
                    } else {
                        stringResource(Res.string.common_export)
                    },
                    style = MaterialTheme.typography.labelMedium,
                    color = AetherOnSurfaceVariant,
                )
            }
            if (swipedFromEnd != SharedDrawerSwipeAction.None) {
                Text(
                    text = if (swipedFromEnd == SharedDrawerSwipeAction.Trash) {
                        stringResource(Res.string.common_delete)
                    } else {
                        stringResource(Res.string.common_export)
                    },
                    style = MaterialTheme.typography.labelMedium,
                    color = if (swipedFromEnd == SharedDrawerSwipeAction.Trash) {
                        Color(0xFFE5695F)
                    } else {
                        AetherOnSurfaceVariant
                    },
                )
            }
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .offset { IntOffset(dragOffset.roundToInt(), 0) }
                .pointerInput(session.id, swipedFromStart, swipedFromEnd, isRenaming) {
                    if (isRenaming) return@pointerInput
                    detectHorizontalDragGestures(
                        onDragEnd = {
                            val action = when {
                                dragOffset >= SharedDrawerSwipeThreshold -> swipedFromStart
                                dragOffset <= -SharedDrawerSwipeThreshold -> swipedFromEnd
                                else -> SharedDrawerSwipeAction.None
                            }
                            dragOffset = 0f
                            performSwipe(action)
                        },
                        onDragCancel = { dragOffset = 0f },
                    ) { _, dragAmount ->
                        dragOffset = (dragOffset + dragAmount)
                            .coerceIn(-SharedDrawerSwipeLimit, SharedDrawerSwipeLimit)
                    }
                }
                .clip(RoundedCornerShape(18.dp))
                .background(if (selected) AetherSurfaceHigh else AetherSidebarBackground)
                .then(
                    if (isRenaming) Modifier else Modifier.combinedClickable(
                        onClick = onClick,
                        onLongClick = { menuExpanded = true },
                    )
                )
                .padding(horizontal = 12.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(30.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(sharedDrawerAvatarTint(session.id)),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = session.title.trim().take(1).uppercase().ifBlank { "A" },
                    style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Medium),
                    color = Color.White,
                )
            }
            Spacer(Modifier.width(10.dp))
            if (isRenaming) {
                BasicTextField(
                    value = titleValue,
                    onValueChange = { titleValue = it },
                    singleLine = true,
                    textStyle = MaterialTheme.typography.bodyLarge.copy(
                        color = AetherOnSurface,
                        fontWeight = FontWeight.Medium,
                    ),
                    cursorBrush = SolidColor(AetherPrimary),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { commitRename() }),
                    modifier = Modifier
                        .weight(1f)
                        .focusRequester(focusRequester)
                        .onFocusChanged { state ->
                            if (state.isFocused) {
                                renameFieldHadFocus = true
                            } else if (renameFieldHadFocus && isRenaming) {
                                commitRename()
                            }
                        }
                )
            } else {
                Text(
                    text = session.title.ifBlank { newChatTitle },
                    style = MaterialTheme.typography.bodyLarge.copy(
                        fontWeight = if (selected) FontWeight.Medium else FontWeight.Normal,
                    ),
                    color = AetherOnSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
            }
            if (session.stampLabel.isNotBlank()) {
                Spacer(Modifier.width(8.dp))
                Text(
                    text = session.stampLabel,
                    style = MaterialTheme.typography.labelSmall,
                    color = AetherOnSurfaceVariant,
                )
            }
            if (session.indicator != SharedConversationIndicator.None) {
                Spacer(Modifier.width(10.dp))
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(
                            if (session.indicator == SharedConversationIndicator.Working) {
                                Color(0xFF22C55E)
                            } else {
                                Color(0xFF3B82F6)
                            }
                        )
                )
            }
        }
        SharedDrawerActionMenu(
            expanded = menuExpanded,
            canMoveToFolder = canMoveToFolder,
            onDismiss = { menuExpanded = false },
            onRename = {
                menuExpanded = false
                titleValue = session.title.ifBlank { newChatTitle }
                renameFieldHadFocus = false
                isRenaming = true
                renameFocusRequest += 1
            },
            onExport = {
                menuExpanded = false
                onExport()
            },
            onDelete = {
                menuExpanded = false
                onDelete()
            },
            onMoveToFolder = {
                menuExpanded = false
                folderPickerExpanded = true
            },
        )
        if (folderPickerExpanded) {
            SharedDrawerFolderPicker(
                folders = folders,
                currentFolderId = currentFolderId,
                onDismiss = { folderPickerExpanded = false },
                onPicked = { folderId ->
                    folderPickerExpanded = false
                    onAssignFolder(folderId)
                },
            )
        }
    }
}

@Composable
private fun SharedDrawerFolderPicker(
    folders: List<SharedDrawerFolder>,
    currentFolderId: String?,
    onDismiss: () -> Unit,
    onPicked: (String?) -> Unit,
) {
    Popup(
        alignment = Alignment.Center,
        onDismissRequest = onDismiss,
        properties = PopupProperties(focusable = true, dismissOnClickOutside = true),
    ) {
        Column(
            modifier = Modifier
                .widthIn(min = 220.dp, max = 280.dp)
                .shadow(20.dp, RoundedCornerShape(24.dp), ambientColor = AetherScrim, spotColor = AetherScrim)
                .clip(RoundedCornerShape(24.dp))
                .background(AetherSurface)
                .padding(10.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(
                text = stringResource(Res.string.drawer_folder_move),
                style = MaterialTheme.typography.labelMedium,
                color = AetherOnSurfaceVariant,
                modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
            )
            SharedDrawerActionRow(
                label = stringResource(Res.string.drawer_folder_none),
                onClick = { onPicked(null) },
                highlighted = currentFolderId == null,
            )
            folders.forEach { folder ->
                SharedDrawerActionRow(
                    label = folder.name,
                    onClick = { onPicked(folder.id) },
                    highlighted = currentFolderId == folder.id,
                )
            }
            if (folders.isEmpty()) {
                Text(
                    text = stringResource(Res.string.drawer_folder_new),
                    style = MaterialTheme.typography.bodySmall,
                    color = AetherOnSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                )
            }
        }
    }
}

@Composable
private fun SharedDrawerActionMenu(
    expanded: Boolean,
    canMoveToFolder: Boolean,
    onDismiss: () -> Unit,
    onRename: () -> Unit,
    onExport: () -> Unit,
    onDelete: () -> Unit,
    onMoveToFolder: () -> Unit,
) {
    val visibility = remember { MutableTransitionState(false) }
    visibility.targetState = expanded
    if (!visibility.currentState && !visibility.targetState) return
    Popup(
        alignment = Alignment.TopEnd,
        offset = IntOffset(0, 34),
        onDismissRequest = onDismiss,
        properties = PopupProperties(
            focusable = true,
            dismissOnBackPress = true,
            dismissOnClickOutside = true,
        ),
    ) {
        AnimatedVisibility(
            visibleState = visibility,
            enter = fadeIn() + scaleIn(initialScale = 0.92f),
            exit = fadeOut() + scaleOut(targetScale = 0.96f),
        ) {
            Column(
                modifier = Modifier
                    .widthIn(min = 188.dp, max = 220.dp)
                    .shadow(18.dp, RoundedCornerShape(24.dp), ambientColor = AetherScrim, spotColor = AetherScrim)
                    .clip(RoundedCornerShape(24.dp))
                    .background(AetherSurface)
                    .padding(8.dp),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                if (canMoveToFolder) {
                    SharedDrawerActionRow(stringResource(Res.string.drawer_folder_move), onMoveToFolder)
                }
                SharedDrawerActionRow(stringResource(Res.string.common_rename), onRename)
                SharedDrawerActionRow(stringResource(Res.string.common_export), onExport)
                SharedDrawerActionRow(stringResource(Res.string.common_delete), onDelete, destructive = true)
            }
        }
    }
}

@Composable
private fun SharedDrawerActionRow(
    label: String,
    onClick: () -> Unit,
    destructive: Boolean = false,
    highlighted: Boolean = false,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(44.dp)
            .clip(RoundedCornerShape(18.dp))
            .background(if (highlighted) AetherSurfaceHigh else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = if (destructive) Color(0xFFB42318) else AetherOnSurface,
        )
    }
}

private fun sharedDrawerOverlayBodyGradient(baseColor: Color): Brush = Brush.verticalGradient(
    colorStops = arrayOf(
        0.0f to baseColor.copy(alpha = 0.94f),
        0.20f to baseColor.copy(alpha = 0.86f),
        0.48f to baseColor.copy(alpha = 0.54f),
        0.78f to baseColor.copy(alpha = 0.18f),
        1.0f to Color.Transparent,
    )
)

private fun sharedDrawerOverlayTailGradient(baseColor: Color): Brush = Brush.verticalGradient(
    colorStops = arrayOf(
        0.0f to baseColor.copy(alpha = 0.18f),
        0.46f to baseColor.copy(alpha = 0.06f),
        1.0f to Color.Transparent,
    )
)