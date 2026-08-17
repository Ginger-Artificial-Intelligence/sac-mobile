import { useEffect, useRef } from 'react';
import { useSyncStore } from '../../store/syncStore';
import { connectSocket, disconnectSocket } from '../../lib/socketConnection';

export default function SocketManager() {
  const token = useSyncStore((state) => state.userToken);
  const tenantId = useSyncStore((state) => state.tenantId);
  const isAuthenticated = useSyncStore((state) => state.isAuthenticated);
  
  const handleRealtimeMessage = useSyncStore((state) => state.handleRealtimeMessage);
  const handleRealtimeStatus = useSyncStore((state) => state.handleRealtimeStatus);

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
    };

    const onNewMessage = (incoming: any) => {
      if (!incoming) return;
      const msgId = incoming._id || incoming.id || '';
      const chatId = incoming.chatId || incoming.chat_id || '';
      const content = incoming.content || incoming.text || '';
      const createdAt = incoming.createdAt || incoming.timestamp || '';
      
      const key = msgId || `${chatId}:${createdAt}:${content}`;
      if (processedKeysRef.current.has(key)) return;
      processedKeysRef.current.add(key);
      
      // Cap deduplication cache size
      if (processedKeysRef.current.size > 2000) {
        processedKeysRef.current = new Set(Array.from(processedKeysRef.current).slice(-1500));
      }

      console.log('🔌 [SOCKET] Received new message:', msgId);
      handleRealtimeMessage(incoming);
    };

    const onStatusChange = (data: any) => {
      if (!data) return;
      console.log('🔌 [SOCKET] Received status change:', data);
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

    if (socket.connected) {
      onConnect();
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('newMessage', onNewMessage);
      socket.off('newMessengerMessage', onNewMessage);
      socket.off('newInstagramMessage', onNewMessage);
      socket.off('new_message', onNewMessage);
      socket.off('message:new', onNewMessage);
      socket.off('statusChange', onStatusChange);
      socket.off('statusChangeBatch', onStatusChangeBatch);
      socket.off('message_status', onStatusChange);
    };
  }, [isAuthenticated, tenantId, token, handleRealtimeMessage, handleRealtimeStatus]);

  return null;
}
