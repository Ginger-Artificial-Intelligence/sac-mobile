import { useEffect, useRef } from 'react';
import { Alert, AppState } from 'react-native';
import { useRouter } from 'expo-router';
import { queryClient } from '../../store/queryClient';
import { useSyncStore } from '../../store/syncStore';
import { connectSocket, disconnectSocket } from '../../lib/socketConnection';

export default function SocketManager() {
  const token = useSyncStore((state) => state.userToken);
  const tenantId = useSyncStore((state) => state.tenantId);
  const isAuthenticated = useSyncStore((state) => state.isAuthenticated);

  const handleRealtimeMessage = useSyncStore((state) => state.handleRealtimeMessage);
  const handleRealtimeStatus = useSyncStore((state) => state.handleRealtimeStatus);
  const refreshRecent = useSyncStore((state) => state.refreshRecent);
  const patchChat = useSyncStore((state) => state.patchChat);
  const router = useRouter();

  const processedKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isAuthenticated || !tenantId || !token) {
      disconnectSocket();
      return;
    }

    const socket = connectSocket(token, tenantId);

    const onConnect = () => {
      console.log('🔌 [SOCKET] Connected to Gateway Socket:', socket.id);
      socket.emit('joinRoom', tenantId, (res: any) => {
        console.log('🔌 [SOCKET] Joined room response:', res);
      });
      // Catch up on anything missed while disconnected (no-op during the initial sync)
      refreshRecent();
    };

    const onNewMessage = (incoming: any) => {
      // console.log('🔌 [SOCKET] Received new message:', incoming);
      // console.dir({ incoming }, { depth: null });
      if (!incoming) return;
      const inner = incoming.message || incoming.payload || incoming;
      const msgId = inner._id || inner.id || incoming._id || incoming.id || '';
      const chatId = inner.chatId || inner.chat_id || incoming.chatId || incoming.chat_id || incoming.chatDetails?._id || incoming.chatDetails?.id || '';
      const content = inner.content || inner.text || incoming.content || incoming.text || '';
      const createdAt = inner.createdAt || inner.timestamp || incoming.createdAt || incoming.timestamp || '';

      const key = msgId || `${chatId}:${createdAt}:${content}`;
      if (processedKeysRef.current.has(key)) return;
      processedKeysRef.current.add(key);

      // Bounded LRU cache eviction (O(1) first item deletion)
      if (processedKeysRef.current.size > 2000) {
        const firstKey = processedKeysRef.current.values().next().value;
        if (firstKey) processedKeysRef.current.delete(firstKey);
      }

      console.log('🔌 [SOCKET] Received new message:', msgId || key);
      handleRealtimeMessage(incoming);
    };

    const onStatusChange = (data: any) => {
      if (!data) return;
      handleRealtimeStatus(data);
    };

    const onStatusChangeBatch = (data: any) => {
      if (!data) return;
      const updates = Array.isArray(data?.updates) ? data.updates : Array.isArray(data) ? data : [];
      console.log('🔌 [SOCKET] Received status change batch, count:', updates.length);
      for (const update of updates) {
        handleRealtimeStatus(update);
      }
    };

    socket.on('connect', onConnect);
    socket.on('newMessage', onNewMessage);
    socket.on('newMessengerMessage', onNewMessage);
    socket.on('newInstagramMessage', onNewMessage);
    socket.on('new_message', onNewMessage);
    socket.on('message:new', onNewMessage);
    socket.on('statusChange', onStatusChange);
    socket.on('statusChangeBatch', onStatusChangeBatch);
    socket.on('message_status', onStatusChange);

    // Keeps the 24-hour window right: { chatId, fullDocument: { last_msg_received_at } }
    const onLastMessageTime = (data: any) => {
      const id = String(data?.chatId ?? '');
      const value = data?.fullDocument?.last_msg_received_at;
      if (id && value != null) patchChat(id, { lastMsgReceivedAt: String(value) });
    };
    // Block / unblock from another device: the payload is the full chat document
    const onDnd = (doc: any) => {
      const id = String(doc?._id ?? doc?.id ?? '');
      if (id) patchChat(id, { isBlocked: Boolean(doc?.isBlocked) });
    };
    // A chat or contact was created elsewhere
    const onContactsUpdated = () => {
      refreshRecent({ force: true });
    };
    // { reminderId, chatId, userId, content, reminderTime }. The server sends it to the whole tenant
    // room, so only show it to the user it is for.
    const onChatReminder = (data: any) => {
      const me = useSyncStore.getState().userId;
      if (data?.userId && me && String(data.userId) !== String(me)) return;
      const chatId = String(data?.chatId ?? '');
      Alert.alert('Reminder', data?.content || 'You have a reminder.', [
        { text: 'Dismiss', style: 'cancel' },
        ...(chatId ? [{ text: 'Open chat', onPress: () => router.push(`/chat/${chatId}` as any) }] : []),
      ]);
    };
    // WhatsApp group changed: { groupId, kind, group: { chatId, status, suspended, participant_count, ... } }.
    // Merge it into the cached group summary of that chat (never create one from the event alone).
    const onGroupUpdate = (data: any) => {
      const group = data?.group;
      const chatId = String(group?.chatId ?? '');
      if (!chatId) return;
      queryClient.setQueryData(['wa-group', chatId], (prev: any) => (prev ? { ...prev, ...group } : prev));
    };
    socket.on('waGroup:update', onGroupUpdate);
    socket.on('lastMessageTime', onLastMessageTime);
    socket.on('dnd', onDnd);
    socket.on('contactsUpdated', onContactsUpdated);
    socket.on('chatReminder', onChatReminder);

    if (socket.connected) {
      onConnect();
    }

    // Safety net for events the socket never delivered: refresh when the app returns to the
    // foreground, and every few minutes while it is active. refreshRecent throttles itself.
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshRecent();
    });
    const refreshTimer = setInterval(() => {
      if (AppState.currentState === 'active') refreshRecent();
    }, 5 * 60 * 1000);

    return () => {
      appStateSub.remove();
      clearInterval(refreshTimer);
      socket.off('connect', onConnect);
      socket.off('newMessage', onNewMessage);
      socket.off('newMessengerMessage', onNewMessage);
      socket.off('newInstagramMessage', onNewMessage);
      socket.off('new_message', onNewMessage);
      socket.off('message:new', onNewMessage);
      socket.off('statusChange', onStatusChange);
      socket.off('statusChangeBatch', onStatusChangeBatch);
      socket.off('message_status', onStatusChange);
      socket.off('waGroup:update', onGroupUpdate);
      socket.off('lastMessageTime', onLastMessageTime);
      socket.off('dnd', onDnd);
      socket.off('contactsUpdated', onContactsUpdated);
      socket.off('chatReminder', onChatReminder);
    };
  }, [isAuthenticated, tenantId, token, handleRealtimeMessage, handleRealtimeStatus, refreshRecent, patchChat, router]);

  return null;
}
