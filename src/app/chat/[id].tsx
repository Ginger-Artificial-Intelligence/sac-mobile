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
  ActivityIndicator
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Text } from "../../components/ui/Text";
import { Icon } from "../../components/ui/Icon";
import { Avatar } from "../../components/ui/Avatar";
import { ChatInput, ReplyingToMessage } from "../../components/ui/ChatInput";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import React from "react";
import { useSyncStore, Message, extractMessages, mapApiMessage } from "../../store/syncStore";
import API from "../../config/axios";
import { upsertMessageBatch } from "../../db/client";
import { MessageRenderer } from "../../components/whatsapp/MessageRenderer";
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
}: {
  item: Message;
  accountId: string;
  onSwipeReply: (msg: Message) => void;
}) => {
  const normalized = useMemo(() => {
    const norm = normalizeChatMessage(item);
    if (!norm.accountId && accountId) {
      norm.accountId = accountId;
    }
    return norm;
  }, [item.id, item.rawJson, item.status, item.text, item.type, item.mediaUrl, item.readReceipt, item.isOutgoing, accountId]);

  const handleReply = useCallback(() => {
    onSwipeReply(item);
  }, [item, onSwipeReply]);

  return (
    <SwipeToReplyWrapper onSwipeReply={handleReply} isOutgoing={normalized.isOutgoing}>
      <MessageRenderer message={normalized} />
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

  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [initialLoading, setInitialLoading] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ReplyingToMessage | null>(null);
  const hasUserScrolled = useRef(false);

  const handleSwipeReply = useCallback((msg: Message) => {
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
  }, [chatName]);

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

  useEffect(() => {
    let cancelled = false;
    useSyncStore.getState().setActiveChatId(chatId);

    // 1. Immediately query cached messages from local SQLite (0ms latency for synced chats)
    loadMessages(chatId).then(async (localCount) => {
      if (cancelled) return;

      setTimeout(() => {
        if (!cancelled) {
          useSyncStore.getState().resetUnreadCount(chatId);
        }
      }, 0);

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
      useSyncStore.getState().setActiveChatId(null);
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

  const handleSend = (text: string, replyTo?: ReplyingToMessage | null) => {
    addLocalMessage(chatId, text, replyTo);
    setReplyingTo(null);
  };

  // Group messages by day and insert separator items
  const groupedData = useMemo(() => {
    const list: any[] = [];
    if (messages.length === 0) return list;

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
  }, [messages]);

  const renderItem = useCallback(({ item }: { item: any }) => {
    if ('isDateSeparator' in item) {
      return <DateSeparator dateStr={item.dateStr} />;
    }
    return (
      <MessageBubble
        item={item}
        accountId={chatAccountId}
        onSwipeReply={handleSwipeReply}
      />
    );
  }, [chatAccountId, handleSwipeReply]);

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

        {/* Header - slightly translucent so wallpaper peeks through */}
        <View
          style={{
            paddingTop: Math.max(insets.top, 12),
            backgroundColor: isDark ? 'rgba(18, 29, 43, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            borderBottomColor: colors.divider,
            borderBottomWidth: 1,
          }}
          className="flex-row items-center justify-between px-3 pb-2 shrink-0 z-10"
        >
          <View className="flex-row items-center gap-2">
            <Pressable
              className="p-2 -ml-2 rounded-full active:opacity-70"
              onPress={() => router.back()}
            >
              <Icon name="arrow-back" size={24} color={colors.onSurface} />
            </Pressable>
            <View className="flex-row items-center gap-3">
              <Avatar fallback={chatAvatar} size={40} />
              <View>
                <Text style={{ fontSize: 16.5, fontWeight: '700', color: colors.onSurface }}>{chatName}</Text>
                {isChatOpen && (
                  <Text style={{ fontSize: 12, color: isDark ? "#4ade80" : "#10b981", fontWeight: "600" }}>Open</Text>
                )}
              </View>
            </View>
          </View>
          <View className="flex-row items-center gap-1">
            <Pressable className="p-2 rounded-full active:opacity-70">
              <Icon name="videocam" size={24} color={colors.onSurfaceVariant} />
            </Pressable>
            <Pressable className="p-2 rounded-full active:opacity-70">
              <Icon name="call" size={24} color={colors.onSurfaceVariant} />
            </Pressable>
            <Pressable className="p-2 rounded-full active:opacity-70">
              <Icon name="more-vert" size={24} color={colors.onSurfaceVariant} />
            </Pressable>
          </View>
        </View>

        {/* Message List Area */}
        <View className="flex-1">
          {initialLoading ? (
            <View className="flex-1 items-center justify-center gap-3">
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={{ color: colors.outline, fontSize: 13, fontWeight: "500" }}>Loading messages…</Text>
            </View>
          ) : messages.length === 0 && !isRefreshing ? (
            <View className="flex-1 items-center justify-center gap-3">
              <Icon name="chat-bubble-outline" size={48} color={colors.outline} />
              <Text style={{ color: colors.outline, fontSize: 15, fontWeight: "500" }}>No messages yet</Text>
              <Text style={{ color: colors.outline, fontSize: 12 }}>Pull down to refresh</Text>
            </View>
          ) : (
            <FlatList
              data={groupedData}
              keyExtractor={(item) => item.id}
              inverted
              initialNumToRender={10}
              maxToRenderPerBatch={10}
              windowSize={5}
              removeClippedSubviews={Platform.OS === 'android'}
              updateCellsBatchingPeriod={50}
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
          )}
        </View>

        {/* Input - bg-surface ensures the input area is solid and readable */}
        <ChatInput
          onSend={handleSend}
          insets={insets}
          keyboardHeight={keyboardHeight}
          onPressTemplates={() => setTemplatesModalVisible(true)}
          replyingTo={replyingTo}
          onCancelReply={handleCancelReply}
        />
      </View>

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