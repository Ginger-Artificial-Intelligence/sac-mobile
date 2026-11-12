import {
  View,
  TextInput,
  Pressable,
  Platform,
  Keyboard,
  FlatList,
  RefreshControl,
  ImageBackground,
  StyleSheet,
  ActivityIndicator,
  Alert,
  BackHandler,
  Linking,
} from "react-native";
import { copyText } from "../../lib/clipboard";
import { lastCustomerMessageMs, isWindowClosed } from "../../lib/chatWindow";
import type { PickedMedia } from "../../lib/mediaUpload";
import { SpecialMessageSheet, type SpecialMode } from "../../components/chat/SpecialMessageSheet";
import type { SpecialMessage } from "../../store/syncStore";
import { NativeDropdown } from "../../components/ui/NativeDropdown";
import { AssignChatModal } from "../../components/chat/AssignChatModal";
import { hapticFeedback } from "../../lib/utils";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Text } from "../../components/ui/Text";
import { Icon } from "../../components/ui/Icon";
import { Avatar } from "../../components/ui/Avatar";
import { ChatInput, ReplyingToMessage } from "../../components/ui/ChatInput";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import React from "react";
import { useSyncStore, Message, extractMessages, mapApiMessage } from "../../store/syncStore";
import API from "../../config/axios";
import { useSocialProfile } from "../../hooks/useSocialProfile";
import { useAfterTransition } from "../../hooks/useAfterTransition";
import { upsertMessageBatch } from "../../db/client";
import { MessageRenderer, ReplyJumpContext } from "../../components/whatsapp/MessageRenderer";
import { indexReactions, reactionTargetIds, type Reaction } from "../../lib/reactions";
import { MessageActionSheet, type MessageAction } from "../../components/chat/MessageActionSheet";
import { ForwardSheet } from "../../components/chat/ForwardSheet";
import { canForwardMessage } from "../../lib/forwardMessage";
import { SwipeToReplyWrapper } from "../../components/whatsapp/SwipeToReplyWrapper";
import { normalizeChatMessage } from "../../lib/messageUtils";
import imagePaths from "../../constants/imagePaths";
import { TemplatesModal } from "../../components/ui/TemplatesModal";
import { storage } from "../../store/mmkv";
import { useThemeStore } from "../../store/themeStore";

// ─── Sub-components ───────────────────────────────────────────────────────────

const MessageBubble = React.memo(({
  item,
  accountId,
  onSwipeReply,
  isGroup = false,
  reactionsMap,
  onRetry,
  onDiscard,
  selected = false,
  highlighted = false,
  selecting = false,
  pinned,
  onLongPress,
  onToggleSelect,
}: {
  selected?: boolean;
  highlighted?: boolean;
  selecting?: boolean;
  pinned?: boolean;
  onLongPress?: (msg: Message) => void;
  onToggleSelect?: (msg: Message) => void;
  item: Message;
  accountId: string;
  onSwipeReply: (msg: Message) => void;
  isGroup?: boolean;
  reactionsMap?: Map<string, Reaction[]>;
  onRetry?: (msg: Message) => void;
  onDiscard?: (msg: Message) => void;
}) => {
  const colors = useThemeStore((state) => state.colors);
  const normalized = useMemo(() => {
    const norm = normalizeChatMessage(item);
    if (!norm.accountId && accountId) {
      norm.accountId = accountId;
    }
    if (reactionsMap?.size) {
      for (const id of reactionTargetIds(norm)) {
        const found = reactionsMap.get(id);
        if (found) {
          (norm as any).reactions = found;
          break;
        }
      }
    }
    if (pinned !== undefined) (norm as any).pinned = pinned;
    return norm;
  }, [item.id, item.rawJson, item.status, item.text, item.type, item.mediaUrl, item.readReceipt, item.isOutgoing, accountId, reactionsMap, pinned]);
  const failed = item.isOutgoing && item.status === "failed";

  const handleReply = useCallback(() => {
    onSwipeReply(item);
  }, [item, onSwipeReply]);

  // In a WhatsApp group the sender is shown above incoming bubbles (as a raw number: the backend has no names)
  const groupSender = isGroup && !normalized.isOutgoing
    ? String((normalized as any).message?.participant_wa_id ?? (normalized as any).participant_wa_id ?? "")
    : "";

  return (
    <SwipeToReplyWrapper
      onSwipeReply={handleReply}
      isOutgoing={normalized.isOutgoing}
      disabled={selecting}
      onLongPress={onLongPress && !selecting ? () => onLongPress(item) : undefined}
    >
      {!!groupSender && (
        <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "700", marginLeft: 10, marginBottom: 2 }}>
          {groupSender}
        </Text>
      )}
      <MessageRenderer message={normalized} />
      {highlighted && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(250,204,21,0.30)" }]} />}
      {selecting && (
        <Pressable
          onPress={() => onToggleSelect?.(item)}
          style={[StyleSheet.absoluteFill, { backgroundColor: selected ? "rgba(37,211,102,0.28)" : "transparent" }]}
        />
      )}
      {failed && (
        <View className="flex-row items-center justify-end gap-4 px-4 pb-1">
          <Text style={{ color: "#e53935", fontSize: 12 }}>Not sent</Text>
          {item.type === "text" && onRetry && (
            <Pressable onPress={() => onRetry(item)} hitSlop={8}>
              <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>Retry</Text>
            </Pressable>
          )}
          {onDiscard && (
            <Pressable onPress={() => onDiscard(item)} hitSlop={8}>
              <Text style={{ color: colors.outline, fontSize: 12, fontWeight: "700" }}>Delete</Text>
            </Pressable>
          )}
        </View>
      )}
    </SwipeToReplyWrapper>
  );
});

const DateSeparator = React.memo(({ dateStr }: { dateStr: string }) => {
  const isDark = useThemeStore((state) => state.isDark);
  const colors = useThemeStore((state) => state.colors);
  return (
    <View className="align-center items-center my-3 py-1">
      <View
        style={{
          backgroundColor: isDark ? "rgba(30, 41, 59, 0.85)" : "rgba(241, 245, 249, 0.95)",
          borderColor: colors.divider,
          borderWidth: 1,
        }}
        className="px-3 py-1 rounded-md shadow-sm"
      >
        <Text style={{ color: colors.onSurfaceVariant }} className="text-[11px] font-semibold tracking-wider uppercase">
          {dateStr}
        </Text>
      </View>
    </View>
  );
});

function getSeparatorDateStr(d: Date, todayStr: string, yesterdayStr: string): string {
  const dateStr = d.toDateString();
  if (dateStr === todayStr) return "Today";
  if (dateStr === yesterdayStr) return "Yesterday";
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

const EMPTY_MESSAGES: Message[] = [];

// Messages are stored newest first; reactions are indexed oldest first. Each entry is the parsed row.
const parsedForReactions = (messages: Message[]) => {
  const out: any[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.rawJson && m.rawJson.includes('"reaction"')) {
      try {
        out.push({ ...m, ...JSON.parse(m.rawJson) });
        continue;
      } catch {
        /* fall through */
      }
    }
    out.push(m);
  }
  return out;
};
const FIRST_RENDER_COUNT = 20;

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const params = useLocalSearchParams<{
    id: string;
    name?: string;
    avatar?: string;
    accountId?: string;
    channel?: string;
    phoneNumber?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [templatesModalVisible, setTemplatesModalVisible] = useState(false);
  const isDark = useThemeStore((state) => state.isDark);
  const colors = useThemeStore((state) => state.colors);

  const chatId = params.id as string;

  const messages = useSyncStore((state) => state.messagesByChat[chatId] || EMPTY_MESSAGES);
  const currentChat = useSyncStore((state) => state.chats.find((c) => c.id === chatId));
  const isChatOpen = currentChat?.isOpen ?? false;
  const loadMessages = useSyncStore((state) => state.loadMessages);
  const addLocalMessage = useSyncStore((state) => state.addLocalMessage);

  const chatName = params.name || currentChat?.name || 'Chat';
  const chatAvatar = params.avatar || currentChat?.avatar || chatName.charAt(0).toUpperCase();
  const chatAccountId = params.accountId || currentChat?.accountId || "";
  const chatPhoneNumber = params.phoneNumber || currentChat?.phoneNumber || "";
  const chatChannel = params.channel || currentChat?.channel || "whatsapp";
  useSocialProfile(chatId, chatChannel, currentChat?.avatar);

  // ── WhatsApp groups and the 24-hour window ─────────────────────────────────
  const isWhatsAppChat = chatChannel === "whatsapp";
  const isGroupChat = Boolean(currentChat?.isGroup);
  const [directSend, setDirectSend] = useState(false);

  // Inbox-safe group summary (updated live by the `waGroup:update` socket event)
  const { data: group } = useQuery({
    queryKey: ["wa-group", chatId],
    enabled: isGroupChat,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<{ status?: string; suspended?: boolean; participant_count?: number } | null> =>
      (await API.get(`/whatsapp-groups/by-chat/${chatId}/summary`)).data?.data ?? null,
  });
  // Same wording as the web app. While the group record is unknown, sending stays allowed.
  const groupNotice = !group
    ? null
    : group.suspended
      ? "This group is suspended. Messages cannot be sent."
      : group.status === "deleted" || group.status === "pending_delete"
        ? "This group is deleted. Messages cannot be sent."
        : group.status && group.status !== "active"
          ? "This group is not active. Messages cannot be sent."
          : null;

  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [initialLoading, setInitialLoading] = useState(false);
  const transitionDone = useAfterTransition();
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [assignVisible, setAssignVisible] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [replyingTo, setReplyingTo] = useState<ReplyingToMessage | null>(null);
  const hasUserScrolled = useRef(false);
  const listRef = useRef<FlatList<any>>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // The list is inverted: offset 0 is the newest message at the bottom
  const scrollToBottom = useCallback((animated = true) => {
    listRef.current?.scrollToOffset({ offset: 0, animated });
  }, []);
  // After sending, the new message is added a moment later: scroll once it is in the list
  const scrollToBottomSoon = useCallback(() => {
    setTimeout(() => scrollToBottom(true), 60);
    setTimeout(() => scrollToBottom(true), 350);
  }, [scrollToBottom]);

  const handleSwipeReply = useCallback((msg: Message) => {
    if (isGroupChat) return; // the server drops replies in groups
    const norm = normalizeChatMessage(msg);
    const sender = norm.isOutgoing ? "You" : (chatName || "Contact");
    const text = norm.content || norm.text || "";
    const whatsappMsgId = norm.message?.id || norm.messageId || (norm as any).wamid || norm._id || msg.id;

    setReplyingTo({
      id: whatsappMsgId,
      messageId: whatsappMsgId,
      messageOgId: whatsappMsgId,
      senderName: sender,
      text,
      type: norm.type || "text",
      mediaUrl: norm.mediaUrl || undefined,
      fileName: norm.mediaFileName || (norm.type === "image" ? "image.jpg" : undefined),
      uploaded_id: norm.mediaId || undefined,
      isOutgoing: norm.isOutgoing,
    });
  }, [chatName, isGroupChat]);

  // ── Message menu / multi-select ─────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [menuMsg, setMenuMsg] = useState<Message | null>(null);
  const [forwardMsgs, setForwardMsgs] = useState<Message[] | null>(null);
  const [pinOverrides, setPinOverrides] = useState<Record<string, boolean>>({});
  const [headerHeight, setHeaderHeight] = useState(0);
  const selecting = selectedIds.length > 0;

  useEffect(() => {
    if (!selecting) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setSelectedIds([]);
      return true;
    });
    return () => sub.remove();
  }, [selecting]);

  // Long press starts selecting (like WhatsApp); the actions are in the bar at the bottom
  const openMenu = useCallback((m: Message) => setSelectedIds((cur) => (cur.length ? cur : [m.id])), []);
  const toggleSelect = useCallback(
    (m: Message) => setSelectedIds((cur) => (cur.includes(m.id) ? cur.filter((x) => x !== m.id) : [...cur, m.id])),
    []
  );

  const isPinned = useCallback(
    (m: Message) => {
      if (pinOverrides[m.id] !== undefined) return pinOverrides[m.id];
      try {
        return m.rawJson ? JSON.parse(m.rawJson).pinned === true : false;
      } catch {
        return false;
      }
    },
    [pinOverrides]
  );

  const togglePin = useCallback(
    async (m: Message) => {
      if (!/^[0-9a-f]{24}$/i.test(m.id)) {
        Alert.alert("Not ready yet", "This message is still being sent. Try again in a moment.");
        return;
      }
      const next = !isPinned(m);
      setPinOverrides((cur) => ({ ...cur, [m.id]: next }));
      try {
        await API.patch(`/messages/${chatId}/pin-message/${m.id}`, { pin: next });
      } catch (e: any) {
        setPinOverrides((cur) => ({ ...cur, [m.id]: !next }));
        Alert.alert(
          next ? "Could not pin" : "Could not unpin",
          e?.response?.status === 403 ? "You don't have permission to pin messages." : e?.response?.data?.message || "Try again."
        );
      }
    },
    [chatId, isPinned]
  );

  const messageText = (m: Message) => {
    const n = normalizeChatMessage(m);
    return String(n.content || n.text || "").trim();
  };

  const copyMessages = useCallback(async (list: Message[]) => {
    const text = [...list].reverse().map(messageText).filter(Boolean).join("\n");
    if (!text) return Alert.alert("Nothing to copy", "These messages have no text.");
    if (!(await copyText(text))) Alert.alert("Could not copy", "Rebuild the app to enable copying.");
  }, []);

  const handleCancelReply = useCallback(() => {
    setReplyingTo(null);
  }, []);

  const fetchMessagesFromApi = useCallback(async () => {
    try {
      const res = await API.get(`/messages/${chatId}`, { params: { page: 1 } });
      const rawMsgs = extractMessages(res.data);

      if (rawMsgs.length === 0) {
        setHasMore(false);
        return;
      }

      const messagesToUpsert = rawMsgs.map((raw) => mapApiMessage(raw, chatId));
      await upsertMessageBatch(messagesToUpsert);
      await useSyncStore.getState().loadMessages(chatId);
      setPage(1);
      if (rawMsgs.length < 15) setHasMore(false);
    } catch (_) { }
  }, [chatId]);

  // Tell the store which chat is open right away (cheap), so incoming messages don't bump its unread count
  useEffect(() => {
    useSyncStore.getState().setActiveChatId(chatId);
    return () => {
      useSyncStore.getState().setActiveChatId(null);
    };
  }, [chatId]);

  // Marking the chat read re-renders the inbox list behind this screen, so wait for the slide-in
  useEffect(() => {
    if (transitionDone) useSyncStore.getState().resetUnreadCount(chatId);
  }, [chatId, transitionDone]);

  // Messages: start immediately. Normally they are already in memory (preloaded on touch-down), so
  // the first frame has them; otherwise read them from local SQLite.
  useEffect(() => {
    let cancelled = false;

    const cachedCount = useSyncStore.getState().messagesByChat[chatId]?.length ?? 0;
    const ready = cachedCount > 0 ? Promise.resolve(cachedCount) : loadMessages(chatId);

    ready.then(async (localCount) => {
      if (cancelled) return;
      setMessagesLoaded(true);

      // 2. If chat has not been synced locally yet (e.g. opened from search or bottom of inbox), fetch page 1 from server
      if (localCount === 0) {
        setInitialLoading(true);
        try {
          await fetchMessagesFromApi();
        } finally {
          if (!cancelled) setInitialLoading(false);
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [chatId, loadMessages, fetchMessagesFromApi]);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const loadMoreMessages = useCallback(async () => {
    // Only fetch when user has explicitly scrolled up
    if (!hasUserScrolled.current || isLoadingMore || !hasMore || messages.length === 0) return;
    setIsLoadingMore(true);
    try {
      // 1. Check local SQLite database first for instant load
      const countLoaded = await useSyncStore.getState().loadOlderMessages(chatId, 40);
      if (countLoaded > 0) {
        setIsLoadingMore(false);
        return;
      }

      // 2. Fetch older messages from API using page query param (matching eazycrm-frontend)
      const nextPage = page + 1;
      const res = await API.get(`/messages/${chatId}`, {
        params: { page: nextPage },
      });
      const rawMsgs = extractMessages(res.data);

      if (rawMsgs.length === 0) {
        setHasMore(false);
      } else {
        const messagesToUpsert = rawMsgs.map((raw) => mapApiMessage(raw, chatId));
        await upsertMessageBatch(messagesToUpsert);
        useSyncStore.getState().appendOlderMessages(chatId, messagesToUpsert);
        setPage(nextPage);
        if (rawMsgs.length < 15) {
          setHasMore(false);
        }
      }
    } catch (err) {
      console.warn('[chat] load more failed:', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [chatId, messages, isLoadingMore, hasMore, page]);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    let isMounted = true;
    const timer = setTimeout(() => {
      if (isMounted) setIsRefreshing(false);
    }, 5000);

    try {
      await fetchMessagesFromApi();
    } catch (err) {
      console.warn('[chat] refresh failed:', err);
    } finally {
      clearTimeout(timer);
      if (isMounted) setIsRefreshing(false);
    }

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [fetchMessagesFromApi]);

  const confirmBlockToggle = () => {
    const blocking = !currentChat?.isBlocked;
    Alert.alert(
      blocking ? 'Block contact' : 'Unblock contact',
      blocking ? `Block ${chatName}? They will not be able to message you.` : `Unblock ${chatName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: blocking ? 'Block' : 'Unblock',
          style: blocking ? 'destructive' : 'default',
          onPress: async () => {
            const ok = await useSyncStore.getState().setChatBlocked(chatId, blocking);
            if (!ok) Alert.alert('Could not update', 'The server refused the change or you are offline.');
          },
        },
      ]
    );
  };

  const runChatAction = async (action: () => Promise<boolean>, failMessage: string) => {
    const ok = await action();
    if (!ok) Alert.alert('Could not update', failMessage);
  };

  const menuActions = [
    { label: 'Contact info', icon: 'person', onClick: () => router.push(`/contact/${chatId}` as any) },
    ...(chatPhoneNumber
      ? [{
          label: 'Copy phone number',
          icon: 'content-copy',
          onClick: async () => {
            if (await copyText(chatPhoneNumber)) hapticFeedback('light');
            else Alert.alert('Could not copy', 'Copying needs the latest app build. Rebuild the app to enable it.');
          },
        }]
      : []),
    { label: 'Search in chat', icon: 'search', onClick: () => setSearchOpen(true) },
    {
      label: currentChat?.isStarred ? 'Unstar chat' : 'Star chat',
      icon: 'star-outline',
      onClick: () => useSyncStore.getState().bulkSetStarred([chatId], !currentChat?.isStarred),
    },
    {
      label: currentChat?.pinned ? 'Unpin chat' : 'Pin chat',
      icon: 'push-pin',
      onClick: () => useSyncStore.getState().bulkSetPinned([chatId], !currentChat?.pinned),
    },
    { label: 'Assign chat', icon: 'person-add', onClick: () => setAssignVisible(true) },
    {
      label: isChatOpen ? 'Close chat' : 'Open chat',
      icon: isChatOpen ? 'lock' : 'lock-open',
      onClick: () =>
        runChatAction(() => useSyncStore.getState().toggleChatOpen(chatId, !isChatOpen), 'The server refused the change or you are offline.'),
    },
    { label: currentChat?.isBlocked ? 'Unblock contact' : 'Block contact', icon: 'block', onClick: confirmBlockToggle },
  ];

  // WhatsApp 24-hour window: the customer must have written within the last 24 hours. The chat's
  // `last_msg_received_at` is the source; chats stored before that field existed fall back to the
  // newest incoming message on this device (so old chats are not locked by mistake).
  // The backend stores that field as an ISO date (older data: unix seconds), so it is parsed by
  // `parseTimeMs`, and the newest incoming message on the device counts too.
  const newestIncomingAt = useMemo(() => messages.find((m) => !m.isOutgoing)?.timestamp, [messages]); // newest first
  const lastCustomerMs = useMemo(
    () => lastCustomerMessageMs(currentChat?.lastMsgReceivedAt, newestIncomingAt),
    [currentChat?.lastMsgReceivedAt, newestIncomingAt]
  );
  const windowClosed = isWhatsAppChat && !isGroupChat && isWindowClosed(lastCustomerMs, messages.length > 0);

  // Images, videos, documents, audio and voice notes: shown at once, uploaded in the background, then sent
  const handleSendMedia = (media: PickedMedia, caption: string, replyTo?: ReplyingToMessage | null) => {
    addLocalMessage(chatId, caption, isGroupChat ? null : replyTo, { media });
    setReplyingTo(null);
    scrollToBottomSoon();
  };

  // Send location / request location / request address
  const [specialMode, setSpecialMode] = useState<SpecialMode | null>(null);
  const handleSendSpecial = (spec: SpecialMessage) => {
    setSpecialMode(null);
    addLocalMessage(chatId, "", null, { special: spec });
    scrollToBottomSoon();
  };

  const handleSend = (text: string, replyTo?: ReplyingToMessage | null) => {
    addLocalMessage(chatId, text, isGroupChat ? null : replyTo, directSend && windowClosed ? { directSend: true } : undefined);
    setReplyingTo(null);
    scrollToBottomSoon();
  };

  // Local search: only messages already stored on this device (the backend search returns a count only)
  // The first frame renders only the newest messages (cheap); the rest follow right after the
  // slide-in, off-screen at the top of the inverted list, so opening a chat feels immediate.
  const [renderAll, setRenderAll] = useState(false);
  useEffect(() => {
    if (!transitionDone) return;
    const t = setTimeout(() => setRenderAll(true), 250);
    return () => clearTimeout(t);
  }, [transitionDone]);

  // Reactions hang under the message they react to instead of being rows of their own
  const reactionIndex = useMemo(() => {
    const oldestFirst = parsedForReactions(messages);
    const { hidden, byTarget } = indexReactions(oldestFirst);
    return { hiddenIds: new Set(Array.from(hidden, (i) => messages[messages.length - 1 - i].id)), byTarget };
  }, [messages]);
  // Keep the same Map between renders until a reaction really changes, so rows do not all re-render
  const reactionKey = useMemo(() => JSON.stringify(Array.from(reactionIndex.byTarget)), [reactionIndex]);
  const reactionsMap = useMemo(() => reactionIndex.byTarget, [reactionKey]);

  const listMessages = useMemo(
    () => (reactionIndex.hiddenIds.size ? messages.filter((m) => !reactionIndex.hiddenIds.has(m.id)) : messages),
    [messages, reactionIndex]
  );

  const visibleMessages = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (searchOpen && q) return listMessages.filter((m) => (m.text || '').toLowerCase().includes(q));
    return renderAll ? listMessages : listMessages.slice(0, FIRST_RENDER_COUNT);
  }, [listMessages, searchOpen, searchText, renderAll]);

  const handleRetry = useCallback(
    (m: Message) => {
      useSyncStore.getState().discardFailedMessage(chatId, m.id);
      addLocalMessage(chatId, m.text, null);
    },
    [chatId, addLocalMessage]
  );
  const handleDiscard = useCallback((m: Message) => useSyncStore.getState().discardFailedMessage(chatId, m.id), [chatId]);

  // Group messages by day and insert separator items
  const groupedData = useMemo(() => {
    const list: any[] = [];
    if (visibleMessages.length === 0) return list;
    const messages = visibleMessages;

    const now = new Date();
    const todayStr = now.toDateString();
    const yest = new Date(now);
    yest.setDate(yest.getDate() - 1);
    const yesterdayStr = yest.toDateString();

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      list.push(msg);

      const nextMsg = messages[i + 1];
      const currentDate = new Date(msg.timestamp);
      const nextDate = nextMsg ? new Date(nextMsg.timestamp) : null;

      if (!nextDate || currentDate.toDateString() !== nextDate.toDateString()) {
        list.push({
          isDateSeparator: true,
          dateStr: getSeparatorDateStr(currentDate, todayStr, yesterdayStr),
          id: `sep-${msg.id}`
        });
      }
    }
    return list;
  }, [visibleMessages]);

  // ── Jump to the message a reply quotes ─────────────────────────────────────
  const pendingJump = useRef<{ ids: string[]; tries: number } | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const idsOfMessage = (m: Message): string[] => {
    const n: any = normalizeChatMessage(m);
    return [m.id, n._id, n.messageId, n.wamid, n.message?.id, n.mid, n.message?.mid, n.message?.wamid].filter(Boolean).map(String);
  };

  const tryJump = useCallback(() => {
    const job = pendingJump.current;
    if (!job) return true;
    const target = listMessages.find((m) => idsOfMessage(m).some((id) => job.ids.includes(id)));
    if (target) {
      const index = groupedData.findIndex((row) => row.id === target.id);
      if (index >= 0) {
        pendingJump.current = null;
        listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
        setHighlightId(target.id);
        if (highlightTimer.current) clearTimeout(highlightTimer.current);
        highlightTimer.current = setTimeout(() => setHighlightId(null), 1800);
        return true;
      }
    }
    return false;
  }, [listMessages, groupedData]);

  const jumpToReply = useCallback(
    (replyTo: any) => {
      const ids = [replyTo?.id, replyTo?.messageId, replyTo?.message_id, replyTo?.messageOgId, replyTo?.wamid, replyTo?._id, replyTo?.uploaded_id]
        .filter(Boolean)
        .map(String);
      if (!ids.length) return;
      pendingJump.current = { ids, tries: 0 };
      hasUserScrolled.current = true;
      setRenderAll(true);
      if (tryJump()) return;
      if (hasMore) loadMoreMessages(); // not loaded yet: fetch older messages until it is found
      else {
        pendingJump.current = null;
        Alert.alert("Message not found", "The original message is too far back or no longer available.");
      }
    },
    [tryJump, loadMoreMessages, hasMore]
  );

  // Keep looking in older messages as they arrive
  useEffect(() => {
    const job = pendingJump.current;
    if (!job) return;
    if (tryJump()) return;
    if (hasMore && job.tries < 8) {
      job.tries++;
      loadMoreMessages();
    } else {
      pendingJump.current = null;
      Alert.alert("Message not found", "The original message is too far back or no longer available.");
    }
  }, [groupedData]);

  const messageMenuActions = useMemo<MessageAction[]>(() => {
    const m = menuMsg;
    if (!m) return [];
    const n = normalizeChatMessage(m);
    const list: MessageAction[] = [];
    if (!isGroupChat) list.push({ key: "reply", label: "Reply", icon: "reply", onPress: () => handleSwipeReply(m) });
    if (canForwardMessage(n)) list.push({ key: "forward", label: "Forward", icon: "forward", onPress: () => setForwardMsgs([m]) });
    if (messageText(m)) list.push({ key: "copy", label: "Copy", icon: "content-copy", onPress: () => copyMessages([m]) });
    list.push({ key: "pin", label: isPinned(m) ? "Unpin" : "Pin", icon: "push-pin", onPress: () => togglePin(m) });
    if (["image", "video", "document", "audio"].includes(n.type) && /^https?:\/\//i.test(n.mediaUrl || "")) {
      list.push({ key: "open", label: "Open / download", icon: "download", onPress: () => Linking.openURL(n.mediaUrl!).catch(() => {}) });
    }
    list.push({ key: "select", label: "Select", icon: "check-circle-outline", onPress: () => setSelectedIds([m.id]) });
    if (m.isOutgoing && m.status === "failed") {
      if (m.type === "text") list.push({ key: "retry", label: "Retry", icon: "refresh", onPress: () => handleRetry(m) });
      list.push({ key: "delete", label: "Delete", icon: "delete", destructive: true, onPress: () => handleDiscard(m) });
    }
    return list;
  }, [menuMsg, isGroupChat, isPinned, handleSwipeReply, copyMessages, togglePin, handleRetry, handleDiscard]);

  const renderItem = useCallback(({ item }: { item: any }) => {
    if ('isDateSeparator' in item) {
      return <DateSeparator dateStr={item.dateStr} />;
    }
    return (
      <MessageBubble
        item={item}
        accountId={chatAccountId}
        onSwipeReply={handleSwipeReply}
        isGroup={isGroupChat}
        reactionsMap={reactionsMap}
        onRetry={handleRetry}
        onDiscard={handleDiscard}
        selecting={selecting}
        selected={selectedIds.includes(item.id)}
        highlighted={highlightId === item.id}
        pinned={pinOverrides[item.id]}
        onLongPress={openMenu}
        onToggleSelect={toggleSelect}
      />
    );
  }, [chatAccountId, handleSwipeReply, isGroupChat, reactionsMap, handleRetry, handleDiscard, selecting, selectedIds, highlightId, pinOverrides, openMenu, toggleSelect]);

  const renderFooter = useCallback(() => {
    if (messages.length === 0) return null;
    if (isLoadingMore) {
      return (
        <View className="items-center py-3">
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      );
    }
    if (!hasMore) {
      return (
        <View className="items-center py-4">
          <Text style={{ color: colors.outline, fontSize: 11, fontWeight: "500" }}>Beginning of chat history</Text>
        </View>
      );
    }
    return null;
  }, [messages.length, hasMore, isLoadingMore, colors]);

  return (
    // We use ImageBackground as the root container to ensure it is behind everything
    <ImageBackground
      source={imagePaths.chat_bg}
      resizeMode="cover"
      style={{ flex: 1, backgroundColor: isDark ? '#0b121c' : '#efeae2' }}
      imageStyle={{ opacity: isDark ? 0.08 : 0.15 }}
    >
      <View className="flex-1" style={{ paddingBottom: keyboardHeight }}>

        {/* Selection header: covers the normal header while messages are selected */}
        {selecting && (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: headerHeight || Math.max(insets.top, 12) + 56,
              paddingTop: Math.max(insets.top, 12),
              backgroundColor: isDark ? "#121d2b" : "#ffffff",
              borderBottomColor: colors.divider,
              borderBottomWidth: 1,
              zIndex: 30,
            }}
            className="flex-row items-center px-3 pb-2"
          >
            <Pressable className="p-2 -ml-2 rounded-full active:opacity-70" onPress={() => setSelectedIds([])}>
              <Icon name="arrow-back" size={24} color={colors.onSurface} />
            </Pressable>
            <Text style={{ fontSize: 18, fontWeight: "700", color: colors.onSurface, marginLeft: 12 }}>{selectedIds.length} selected</Text>
          </View>
        )}

        {/* Header - slightly translucent so wallpaper peeks through */}
        <View
          style={{
            paddingTop: Math.max(insets.top, 12),
            backgroundColor: isDark ? 'rgba(18, 29, 43, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            borderBottomColor: colors.divider,
            borderBottomWidth: 1,
          }}
          className="flex-row items-center justify-between px-3 pb-2 shrink-0 z-10"
          onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
        >
          <View className="flex-row items-center gap-2">
            <Pressable
              className="p-2 -ml-2 rounded-full active:opacity-70"
              onPress={() => router.back()}
            >
              <Icon name="arrow-back" size={24} color={colors.onSurface} />
            </Pressable>
            <Pressable className="flex-row items-center gap-3" onPress={() => router.push(`/contact/${chatId}` as any)}>
              <Avatar
                source={chatAvatar.startsWith('http') ? { uri: chatAvatar } : undefined}
                fallback={chatAvatar}
                size={40}
              />
              <View>
                <Text style={{ fontSize: 16.5, fontWeight: '700', color: colors.onSurface }}>{chatName}</Text>
                {(chatChannel === 'instagram' || chatChannel === 'messenger') && !!currentChat?.username && (
                  <Text style={{ fontSize: 12, color: colors.onSurfaceVariant }}>@{currentChat.username}</Text>
                )}
                {isGroupChat && (
                  <Text style={{ fontSize: 12, color: colors.onSurfaceVariant }}>
                    {group?.participant_count ? `${group.participant_count} participants` : "Group"}
                  </Text>
                )}
                {isChatOpen && (
                  <Text style={{ fontSize: 12, color: isDark ? "#4ade80" : "#10b981", fontWeight: "600" }}>Open</Text>
                )}
              </View>
            </Pressable>
          </View>
          <NativeDropdown
            expanded={menuOpen}
            onDismissRequest={() => setMenuOpen(false)}
            onRequestOpen={() => setMenuOpen(true)}
            style={{ width: 44, height: 44 }}
            trigger={
              <View style={{ width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' }}>
                <Icon name="more-vert" size={24} color={colors.onSurfaceVariant} />
              </View>
            }
            actions={menuActions}
          />
        </View>

        {/* Search in this chat (messages stored on this device) */}
        {searchOpen && (
          <View
            style={{ backgroundColor: colors.surfaceContainerLowest, borderBottomColor: colors.divider, borderBottomWidth: 1 }}
            className="flex-row items-center px-3 py-2 gap-2"
          >
            <TextInput
              autoFocus
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Search messages on this device…"
              placeholderTextColor={colors.outline}
              style={{ flex: 1, color: colors.onSurface, fontSize: 15, paddingVertical: 6 }}
            />
            {searchText.trim().length > 0 && (
              <Text style={{ color: colors.outline, fontSize: 12 }}>{visibleMessages.length} found</Text>
            )}
            <Pressable
              onPress={() => {
                setSearchOpen(false);
                setSearchText('');
              }}
              hitSlop={8}
            >
              <Icon name="close" size={22} color={colors.outline} />
            </Pressable>
          </View>
        )}

        {/* Message List Area */}
        <View className="flex-1">
          {initialLoading ? (
            <View className="flex-1 items-center justify-center gap-3">
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={{ color: colors.outline, fontSize: 13, fontWeight: "500" }}>Loading messages…</Text>
            </View>
          ) : messages.length === 0 && !messagesLoaded ? (
            // Local messages not read yet: show just the wallpaper (no "No messages yet" flash)
            <View className="flex-1" />
          ) : messages.length === 0 && !isRefreshing ? (
            <View className="flex-1 items-center justify-center gap-3">
              <Icon name="chat-bubble-outline" size={48} color={colors.outline} />
              <Text style={{ color: colors.outline, fontSize: 15, fontWeight: "500" }}>No messages yet</Text>
              <Text style={{ color: colors.outline, fontSize: 12 }}>Pull down to refresh</Text>
            </View>
          ) : (
            <ReplyJumpContext.Provider value={jumpToReply}>
            <FlatList
              ref={listRef}
              data={groupedData}
              keyExtractor={(item) => item.id}
              inverted
              initialNumToRender={8}
              maxToRenderPerBatch={6}
              windowSize={7}
              removeClippedSubviews={false}
              updateCellsBatchingPeriod={50}
              onScroll={(e) => {
                const away = e.nativeEvent.contentOffset.y > 320;
                setShowScrollDown((cur) => (cur === away ? cur : away));
              }}
              scrollEventThrottle={64}
              onScrollToIndexFailed={(info) => {
                // The row is not measured yet: go near it, then try again
                listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
                setTimeout(() => listRef.current?.scrollToIndex({ index: info.index, viewPosition: 0.5, animated: true }), 120);
              }}
              onScrollBeginDrag={() => { hasUserScrolled.current = true; }}
              onMomentumScrollBegin={() => { hasUserScrolled.current = true; }}
              onEndReached={loadMoreMessages}
              onEndReachedThreshold={0.4}
              contentContainerStyle={{ paddingVertical: 16, paddingHorizontal: 8 }}
              showsVerticalScrollIndicator={false}
              ListFooterComponent={renderFooter}
              refreshControl={
                <RefreshControl
                  refreshing={isRefreshing}
                  onRefresh={onRefresh}
                  tintColor={colors.primary}
                  colors={[colors.primary]}
                />
              }
              renderItem={renderItem}
            />
            </ReplyJumpContext.Provider>
          )}
          {showScrollDown && (
            <Pressable
              onPress={() => scrollToBottom(true)}
              style={{
                position: "absolute",
                right: 14,
                bottom: 14,
                width: 42,
                height: 42,
                borderRadius: 21,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: isDark ? "#1f2c3a" : "#ffffff",
                borderColor: colors.divider,
                borderWidth: 1,
                elevation: 4,
              }}
            >
              <Icon name="keyboard-double-arrow-down" size={24} color={colors.onSurfaceVariant} />
            </Pressable>
          )}
        </View>

        {/* Selection actions replace the composer while messages are selected */}
        {selecting ? (
          <View
            style={{
              backgroundColor: isDark ? "#121d2b" : "#ffffff",
              borderTopColor: colors.divider,
              borderTopWidth: 1,
              paddingBottom: keyboardHeight > 0 ? 8 : Math.max(insets.bottom, 8),
            }}
            className="flex-row items-center justify-around pt-2"
          >
            {(() => {
              const chosen = messages.filter((m) => selectedIds.includes(m.id));
              const one = chosen.length === 1 ? chosen[0] : null;
              const forwardable = chosen.filter((m) => canForwardMessage(normalizeChatMessage(m)));
              const bar: { key: string; label: string; icon: string; show: boolean; onPress: () => void }[] = [
                { key: "reply", label: "Reply", icon: "reply", show: !!one && !isGroupChat, onPress: () => { if (one) { handleSwipeReply(one); setSelectedIds([]); } } },
                { key: "forward", label: "Forward", icon: "forward", show: forwardable.length > 0, onPress: () => { setForwardMsgs(forwardable); setSelectedIds([]); } },
                { key: "copy", label: "Copy", icon: "content-copy", show: true, onPress: () => { copyMessages(chosen); setSelectedIds([]); } },
                { key: "retry", label: "Retry", icon: "refresh", show: !!one && one.isOutgoing && one.status === "failed" && one.type === "text", onPress: () => { if (one) { handleRetry(one); setSelectedIds([]); } } },
                { key: "delete", label: "Delete", icon: "delete", show: !!one && one.isOutgoing && one.status === "failed", onPress: () => { if (one) { handleDiscard(one); setSelectedIds([]); } } },
                { key: "pin", label: one && isPinned(one) ? "Unpin" : "Pin", icon: "push-pin", show: !!one, onPress: () => { if (one) { togglePin(one); setSelectedIds([]); } } },
              ];
              return bar.filter((b) => b.show).map((b) => (
                <Pressable key={b.key} onPress={b.onPress} className="items-center px-3 py-1 active:opacity-60">
                  <Icon name={b.icon as any} size={24} color={colors.onSurface} />
                  <Text style={{ fontSize: 12, color: colors.onSurface, marginTop: 2 }}>{b.label}</Text>
                </Pressable>
              ));
            })()}
          </View>
        ) : (
        <ChatInput
          onSend={handleSend}
          onSendMedia={handleSendMedia}
          onOpenSpecial={setSpecialMode}
          insets={insets}
          keyboardHeight={keyboardHeight}
          onPressTemplates={() => setTemplatesModalVisible(true)}
          replyingTo={replyingTo}
          onCancelReply={handleCancelReply}
          channel={chatChannel}
          isGroup={isGroupChat}
          windowClosed={windowClosed}
          lastCustomerAt={lastCustomerMs}
          directSend={directSend}
          onToggleDirectSend={setDirectSend}
          groupNotice={groupNotice}
        />
        )}
      </View>

      <MessageActionSheet
        visible={menuMsg !== null}
        preview={menuMsg ? messageText(menuMsg) : ""}
        actions={messageMenuActions}
        onClose={() => setMenuMsg(null)}
      />
      <ForwardSheet messages={forwardMsgs} phoneNumberId={chatAccountId} onClose={() => setForwardMsgs(null)} />

      <SpecialMessageSheet mode={specialMode} onClose={() => setSpecialMode(null)} onSubmit={handleSendSpecial} />

      {assignVisible && (
        <AssignChatModal chatId={chatId} visible={assignVisible} onClose={() => setAssignVisible(false)} />
      )}

      {templatesModalVisible && (
        <TemplatesModal
          visible={templatesModalVisible}
          onClose={() => setTemplatesModalVisible(false)}
          chatAccountId={chatAccountId}
          chatPhoneNumber={chatPhoneNumber}
          chatId={chatId}
          channel={chatChannel}
          onSuccess={async (newMsg) => {
            await useSyncStore.getState().handleRealtimeMessage(newMsg);
          }}
        />
      )}
    </ImageBackground>
  );
}