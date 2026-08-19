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
  InteractionManager
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Text } from "../../components/ui/Text";
import { Icon } from "../../components/ui/Icon";
import { Avatar } from "../../components/ui/Avatar";
import { ChatInput } from "../../components/ui/ChatInput";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useState, useEffect, useCallback, useMemo } from "react";
import React from "react";
import { useSyncStore, Message } from "../../store/syncStore";
import API from "../../config/axios";
import { MessageRenderer } from "../../components/whatsapp/MessageRenderer";
import { normalizeChatMessage } from "../../lib/messageUtils";
import imagePaths from "../../constants/imagePaths";
import { TemplatesModal } from "../../components/ui/TemplatesModal";
import { storage } from "../../store/mmkv";
import { useThemeStore } from "../../store/themeStore";

// ─── Sub-components ───────────────────────────────────────────────────────────

const MessageBubble = React.memo(({ item, accountId }: { item: Message, accountId: string }) => {
  const normalized = normalizeChatMessage(item);
  return <MessageRenderer message={{ ...normalized, accountId: normalized.accountId || accountId }} />;
});

const DateSeparator = React.memo(({ dateStr }: { dateStr: string }) => {
  const isDark = useThemeStore((state) => state.isDark);
  const colors = useThemeStore((state) => state.colors);
  return (
    <View className="align-center items-center my-3 py-1">
      <View 
        style={{
          backgroundColor: isDark ? "#172435" : "#e1f3ff",
          borderColor: colors.divider,
          borderWidth: 1,
        }}
        className="rounded-full px-3.5 py-1.5 shadow-xs"
      >
        <Text style={{ fontSize: 10, fontWeight: "700", color: colors.primary }} className="uppercase tracking-wider">{dateStr}</Text>
      </View>
    </View>
  );
});

const EMPTY_MESSAGES: Message[] = [];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const params = useLocalSearchParams<{ id: string; name?: string; avatar?: string; accountId?: string; channel?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [templatesModalVisible, setTemplatesModalVisible] = useState(false);
  const isDark = useThemeStore((state) => state.isDark);
  const colors = useThemeStore((state) => state.colors);

  const chatId = params.id as string;

  const messages = useSyncStore((state) => state.messagesByChat[chatId] || EMPTY_MESSAGES);
  const chat = useSyncStore(useCallback((state) => state.chats.find((c) => c.id === chatId), [chatId]));
  const loadMessages = useSyncStore((state) => state.loadMessages);
  const addLocalMessage = useSyncStore((state) => state.addLocalMessage);

  const chatName = params.name || chat?.name || chat?.username || 'Chat';
  const chatAvatar = params.avatar || chat?.avatar || chatName.charAt(0).toUpperCase();
  const chatAccountId = useMemo(() => {
    if (params.accountId) return params.accountId;
    if (chat?.accountId) return chat.accountId;
    if (chat?.socialAccountId) return chat.socialAccountId;
    if (chat?.rawJson) {
      try {
        const parsed = JSON.parse(chat.rawJson);
        const pid = parsed.phone_number_id || parsed.phoneNumberId || parsed.accountId || parsed.chatAccountId || parsed.socialAccountId;
        if (pid) return String(pid);
      } catch (_) {}
    }
    const cachedAccsStr = storage.getString('cached_social_accounts');
    if (cachedAccsStr) {
      try {
        const accs = JSON.parse(cachedAccsStr);
        const wa = accs.find((a: any) => String(a.channel).toLowerCase() === 'whatsapp' && (a.phone_number_id || a.chatAccountId || a.accountId));
        if (wa) return String(wa.phone_number_id || wa.chatAccountId || wa.accountId);
      } catch (_) {}
    }
    return "";
  }, [params.accountId, chat]);

  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const fetchMessagesFromApi = useCallback(async () => {
    try {
      const res = await API.get(`/messages/${chatId}/sync`, { params: { direction: 'older', limit: 50 } });
      const rawMsgs: any[] = Array.isArray(res.data?.data) ? res.data.data
        : Array.isArray(res.data) ? res.data : [];

      if (rawMsgs.length === 0) {
        setHasMore(false);
        return;
      }

      const { upsertMessageBatch } = require('../../db/client');
      const messagesToUpsert = rawMsgs.map((raw) => ({
        id: String(raw.id || raw._id || Date.now() + Math.random()),
        chatId,
        content: raw.text || raw.content || raw.message?.text?.body || raw.payload?.text?.body || raw.caption || '',
        type: raw.type || 'text',
        isOutgoing: Boolean(raw.isOutgoing ?? (raw.direction === 'outgoing' || raw.fromMe)),
        status: raw.status || 'sent',
        timestamp: raw.createdAt ? new Date(raw.createdAt).getTime() : Date.now(),
        mediaUrl: raw.mediaUrl || raw.url || null,
        rawJson: JSON.stringify(raw),
      }));

      await upsertMessageBatch(messagesToUpsert);
      await useSyncStore.getState().loadMessages(chatId);
      if (rawMsgs.length < 50) setHasMore(false);
    } catch (_) { }
  }, [chatId]);

  useEffect(() => {
    let cancelled = false;
    // 1. Immediately load cached messages from local SQLite (0ms UI latency)
    loadMessages(chatId).then(() => {
      if (!cancelled) {
        useSyncStore.getState().resetUnreadCount(chatId);
      }
    });

    // 2. Defer heavy network API sync and media prefetching until after screen transition animation finishes
    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      fetchMessagesFromApi();
      try {
        const { prefetchChatMedia } = require('../../db/client');
        prefetchChatMedia(chatId);
      } catch (_) { }
    });

    return () => {
      cancelled = true;
      task.cancel();
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
    if (isLoadingMore || !hasMore || messages.length === 0) return;
    setIsLoadingMore(true);
    try {
      const oldestMsg = messages[messages.length - 1];
      const res = await API.get(`/messages/${chatId}/sync`, {
        params: {
          direction: 'older',
          limit: 35,
          cursorCreatedAt: oldestMsg.timestamp,
          cursorId: oldestMsg.id,
        },
      });

      const rawMsgs: any[] = Array.isArray(res.data?.data) ? res.data.data
        : Array.isArray(res.data) ? res.data : [];

      if (rawMsgs.length === 0) {
        setHasMore(false);
      } else {
        const { db, expoDb } = require('../../db/client');
        const { messages: messagesTable } = require('../../db/schema');
        await expoDb.withTransactionAsync(async () => {
          for (const m of rawMsgs) {
            const msgId = String(m._id || m.id || Math.random().toString(36));
            const ts = m.createdAt || m.timestamp || new Date().toISOString();
            const type = m.message_type || m.type || m.message?.type || 'text';
            const text = m.content || m.text || m.body || m.message?.text || m.message?.caption || '';
            const mediaUrl = m.mediaUrl || m.media_url || m.message?.image?.url || m.message?.video?.url || m.message?.audio?.url || m.message?.document?.url || null;
            const isOutgoing = m.isOutgoing === true || m.fromCrm === true || String(m.flag || '').toLowerCase() === 'outgoing';
            await db.insert(messagesTable).values({
              id: msgId,
              chatId,
              text,
              sender: isOutgoing ? 'You' : (m.senderId || 'Contact'),
              isOutgoing,
              type,
              mediaUrl,
              status: m.status || 'delivered',
              timestamp: typeof ts === 'number' ? new Date(ts).toISOString() : String(ts),
              readReceipt: m.status || null,
              isImage: type === 'image',
              rawJson: m ? JSON.stringify(m) : null,
            }).onConflictDoUpdate({
              target: messagesTable.id,
              set: {
                text,
                type,
                mediaUrl,
                isOutgoing,
                isImage: type === 'image',
                status: m.status || 'delivered',
                readReceipt: m.status || null,
                rawJson: m ? JSON.stringify(m) : null
              },
            });
          }
        });
        await loadMessages(chatId);
      }
    } catch (err) {
      console.warn('[chat] load more failed:', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [chatId, messages, isLoadingMore, hasMore]);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    let isMounted = true;
    const timer = setTimeout(() => {
      if (isMounted) setIsRefreshing(false);
    }, 5000);

    (async () => {
      try {
        await fetchMessagesFromApi();
      } catch (err) {
        console.warn('[chat] refresh failed:', err);
      } finally {
        clearTimeout(timer);
        if (isMounted) setIsRefreshing(false);
      }
    })();

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [fetchMessagesFromApi]);

  const handleSend = (text: string) => addLocalMessage(chatId, text);

  // Group messages by day and insert separator items
  const groupedData = useMemo(() => {
    const list: any[] = [];
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      list.push(msg);

      const nextMsg = messages[i + 1];
      const currentDate = new Date(msg.timestamp);
      const nextDate = nextMsg ? new Date(nextMsg.timestamp) : null;

      if (!nextDate || currentDate.toDateString() !== nextDate.toDateString()) {
        const formatSeparatorDate = (date: Date): string => {
          const today = new Date();
          const yesterday = new Date();
          yesterday.setDate(today.getDate() - 1);
          if (date.toDateString() === today.toDateString()) return "Today";
          if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
          return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        };
        list.push({ isDateSeparator: true, dateStr: formatSeparatorDate(currentDate), id: `sep-${msg.id}` });
      }
    }
    return list;
  }, [messages]);

  const renderFooter = useCallback(() => {
    if (messages.length === 0) return null;
    if (!hasMore) {
      return (
        <View className="items-center py-4">
          <Text className="text-xs text-on-surface-variant/60">All messages loaded</Text>
        </View>
      );
    }
    return (
      <View className="items-center py-2">
        <Pressable
          onPress={loadMoreMessages}
          disabled={isLoadingMore}
          style={({ pressed }) => ({
            backgroundColor: pressed ? 'rgba(0, 50, 107, 0.08)' : 'transparent',
            borderColor: 'rgba(0, 50, 107, 0.25)',
            borderWidth: 1,
            borderRadius: 20,
            paddingHorizontal: 16,
            paddingVertical: 8,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6
          })}
        >
          {isLoadingMore ? (
            <ActivityIndicator size="small" color="#00326b" />
          ) : (
            <>
              <Icon name="history" size={14} color="#00326b" />
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#00326b' }}>Load More</Text>
            </>
          )}
        </Pressable>
      </View>
    );
  }, [messages.length, hasMore, isLoadingMore, loadMoreMessages]);

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
                {chat?.isOpen && (
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
          {messages.length === 0 && !isRefreshing ? (
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
              initialNumToRender={15}
              maxToRenderPerBatch={15}
              windowSize={11}
              removeClippedSubviews={Platform.OS === 'android'}
              updateCellsBatchingPeriod={50}
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
              renderItem={({ item }) => {
                if ('isDateSeparator' in item) {
                  return <DateSeparator dateStr={item.dateStr} />;
                }
                return <MessageBubble item={item} accountId={chatAccountId} />;
              }}
            />
          )}
        </View>

        {/* Input - bg-surface ensures the input area is solid and readable */}
        <ChatInput 
          onSend={handleSend} 
          insets={insets} 
          keyboardHeight={keyboardHeight} 
          onPressTemplates={() => setTemplatesModalVisible(true)}
        />
      </View>

      <TemplatesModal
        visible={templatesModalVisible}
        onClose={() => setTemplatesModalVisible(false)}
        chatAccountId={chatAccountId}
        chatPhoneNumber={chat?.phoneNumber || ""}
        chatId={chatId}
        channel={chat?.channel || "whatsapp"}
        onSuccess={async (newMsg) => {
          await useSyncStore.getState().handleRealtimeMessage(newMsg);
        }}
      />
    </ImageBackground>
  );
}