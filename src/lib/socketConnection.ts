// @ts-ignore
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';

const GATEWAY_URL = 'https://premiumapigateway.scribbleandconnect.com';

let globalSocket: Socket | null = null;

export const connectSocket = (token: string, tenantId: string): Socket => {
  if (globalSocket && (globalSocket.auth as any)?.token === token) {
    return globalSocket;
  }

  if (globalSocket) {
    globalSocket.removeAllListeners();
    globalSocket.disconnect();
    globalSocket = null;
  }

  const socketInstance = io(GATEWAY_URL, {
    path: '/socket',
    auth: { token, tenantId },
    transports: ['websocket', "polling"],
    upgrade: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    extraHeaders: {
      origin: 'https://premiumcrm.scribbleandconnect.com'
    }
  }) as Socket;

  socketInstance.on('connect', () => {
    console.log('🔌 [SOCKET] Connected successfully, id:', socketInstance.id);
  });

  socketInstance.on('connect_error', (err: any) => {
    console.dir({ err }, { depth: null })
    console.error(`❌ [SOCKET] Connection Error: ${err}`);
  });

  socketInstance.on('reconnect_attempt', (attempt: number) => {
    console.log(`🔌 [SOCKET] Reconnection attempt #${attempt}`);
  });

  socketInstance.on('reconnect_failed', () => {
    console.error('❌ [SOCKET] Reconnection failed completely');
  });

  socketInstance.on('disconnect', (reason: any) => {
    console.warn(`⚠️ [SOCKET] Disconnected: ${reason}`);
  });

  globalSocket = socketInstance;
  return socketInstance;
};

export const getSocket = (): Socket | null => globalSocket;

export const disconnectSocket = () => {
  if (globalSocket) {
    globalSocket.removeAllListeners();
    globalSocket.disconnect();
    globalSocket = null;
  }
};
