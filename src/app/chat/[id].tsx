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
import { ChatInput } from "../../components/ui/ChatInput";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useState, useEffect, useCallback, useMemo } from "react";
import React from "react";
import { useSyncStore, Message } from "../../store/syncStore";
import API from "../../config/axios";
import { MessageRenderer } from "../../components/whatsapp/MessageRenderer";
import { normalizeChatMessage } from "../../lib/messageUtils";

// ─── Assets ──────────────────────────────────────────────────────────────────
const CHAT_BACKGROUND = require("../../../assets/images/chatwallper.jpg");

// ─── Sub-components ───────────────────────────────────────────────────────────

const MessageBubble = React.memo(({ item, accountId }: { item: Message, accountId: string }) => {
  // console.log({ item, accountId });
  const normalized = normalizeChatMessage(item);
  return <MessageRenderer message={{ ...normalized, accountId: normalized.accountId || accountId }} />;
});

const EMPTY_MESSAGES: Message[] = [];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const chatId = id as string;

  const messages = useSyncStore((state) => state.messagesByChat[chatId] || EMPTY_MESSAGES);
  const chats = useSyncStore((state) => state.chats);
  const loadMessages = useSyncStore((state) => state.loadMessages);
  const addLocalMessage = useSyncStore((state) => state.addLocalMessage);

  const chat = chats.find((c) => c.id === chatId);
  const chatName = chat?.name ?? chat?.username ?? 'Chat';
  const chatAvatar = chat?.avatar ?? chatName.charAt(0).toUpperCase();
  const chatAccountId = chat?.accountId || ""

  useEffect(() => {
    const init = async () => {
      await loadMessages(chatId);
      fetchMessagesFromApi();
      try {
        const { prefetchChatMedia } = require('../../db/client');
        prefetchChatMedia(chatId);
      } catch (_) { }
    };
    init();
  }, [chatId]);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const fetchMessagesFromApi = useCallback(async () => {
    try {
      const res = await API.get(`/messages/${chatId}/sync`, { params: { direction: 'older', limit: 50 } });
      const rawMsgs: any[] = Array.isArray(res.data?.data) ? res.data.data
        : Array.isArray(res.data) ? res.data : [];

      if (rawMsgs.length > 0) {
        const { db } = require('../../db/client');
        const { messages: messagesTable } = require('../../db/schema');
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
        await loadMessages(chatId);
      }
    } catch (err) {
      console.warn('[chat] message fetch failed:', err);
    }
  }, [chatId]);

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
        const { db } = require('../../db/client');
        const { messages: messagesTable } = require('../../db/schema');
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
        await loadMessages(chatId);
      }
    } catch (err) {
      console.warn('[chat] load more failed:', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [chatId, messages, isLoadingMore, hasMore]);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchMessagesFromApi();
    setIsRefreshing(false);
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
      source={CHAT_BACKGROUND}
      resizeMode="repeat"
      style={{ flex: 1, backgroundColor: '#f4f5f8' }} // Fallback background color
      imageStyle={{ opacity: 0.06 }} // Subtle crisp WhatsApp-style doodle pattern
    >
      <View className="flex-1" style={{ paddingBottom: keyboardHeight }}>

        {/* Header - bg-surface/95 makes it slightly translucent so wallpaper peeks through */}
        <View
          className="bg-surface/95 border-b border-outline-variant flex-row items-center justify-between px-3 pb-2 shrink-0 z-10"
          style={{ paddingTop: Math.max(insets.top, 12) }}
        >
          <View className="flex-row items-center gap-2">
            <Pressable
              className="p-2 -ml-2 rounded-full active:bg-surface-variant/50"
              onPress={() => router.back()}
            >
              <Icon name="arrow-back" size={24} className="text-on-surface-variant" />
            </Pressable>
            <View className="flex-row items-center gap-3">
              <Avatar fallback={chatAvatar} size={40} />
              <View>
                <Text className="font-headline-md">{chatName}</Text>
                {chat?.isOpen && (
                  <Text className="font-caption text-secondary">Open</Text>
                )}
              </View>
            </View>
          </View>
          <View className="flex-row items-center gap-1">
            <Pressable className="p-2 rounded-full active:bg-surface-variant/50">
              <Icon name="videocam" size={24} className="text-on-surface-variant" />
            </Pressable>
            <Pressable className="p-2 rounded-full active:bg-surface-variant/50">
              <Icon name="call" size={24} className="text-on-surface-variant" />
            </Pressable>
            <Pressable className="p-2 rounded-full active:bg-surface-variant/50">
              <Icon name="more-vert" size={24} className="text-on-surface-variant" />
            </Pressable>
          </View>
        </View>

        {/* Message List Area */}
        <View className="flex-1">
          {messages.length === 0 && !isRefreshing ? (
            <View className="flex-1 items-center justify-center gap-3">
              <Icon name="chat-bubble-outline" size={48} className="text-outline" />
              <Text className="font-body-md text-on-surface-variant">No messages yet</Text>
              <Text className="font-caption text-on-surface-variant">Pull down to refresh</Text>
            </View>
          ) : (
            <FlatList
              data={groupedData}
              keyExtractor={(item) => item.id}
              inverted
              contentContainerStyle={{ paddingVertical: 16, paddingHorizontal: 8 }}
              showsVerticalScrollIndicator={false}
              ListFooterComponent={renderFooter}
              refreshControl={
                <RefreshControl
                  refreshing={isRefreshing}
                  onRefresh={onRefresh}
                  tintColor="#00326b"
                  colors={["#00326b"]}
                />
              }
              renderItem={({ item }) => {
                if ('isDateSeparator' in item) {
                  return (
                    <View className="align-center items-center my-3 py-1">
                      <View className="bg-[#e1f3ff] border border-outline-variant/10 rounded-full px-3.5 py-1.5 shadow-xs">
                        <Text className="text-[10px] font-bold text-primary uppercase tracking-wider">{item.dateStr}</Text>
                      </View>
                    </View>
                  );
                }
                return <MessageBubble item={item} accountId={chatAccountId} />;
              }}
            />
          )}
        </View>

        {/* Input - bg-surface ensures the input area is solid and readable */}
        <ChatInput onSend={handleSend} insets={insets} keyboardHeight={keyboardHeight} />
      </View>
    </ImageBackground>
  );
}