import { create } from 'zustand';
import { db } from '../db/client';
import { chats as chatsTable, messages as messagesTable, contacts as contactsTable } from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import { storage, mmkvKeys } from './mmkv';
import API from '../config/axios';

// ─── Domain Types ────────────────────────────────────────────────────────────

export interface Chat {
  id: string;
  name: string;
  username: string | null;
  phoneNumber: string | null;
  channel: string | null;
  accountId: string | null;
  lastMessage: string | null;
  unreadCount: number;
  avatar: string | null;
  pinned: boolean;
  isStarred: boolean;
  isOpen: boolean;
  isBlocked: boolean;
  assignedToName: string | null;
  leadStage: string | null;
  socialAccountId: string | null;
  updatedAt: string;
  isCampaignChat: boolean;
}

export interface Message {
  id: string;
  chatId: string;
  text: string;
  sender: string | null;
  isOutgoing: boolean;
  type: string;
  mediaUrl: string | null;
  status: string;
  timestamp: string;
  readReceipt: string | null;
  isImage: boolean;
  rawJson: string | null;
}

export interface Contact {
  id: string;
  name: string;
  username: string | null;
  phone: string | null;
  channel: string | null;
  status: string | null;
  subStatus: string | null;
  lastActivity: string | null;
}

export interface SyncProgress {
  label: string;
  chatsSynced: number;
  totalChats: number;
  messagesSynced: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MAX_CHAT_PAGES = 5;      // up to 5 × 30 = 150 chats per sync
const CHAT_PAGE_SIZE = 30;
const MAX_MESSAGE_CHATS = 40;  // fetch messages for the 40 most recent chats

/** Robustly extract array of chats from any API response shape */
function extractChats(response: any): any[] {
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.chats)) return response.chats;
  if (Array.isArray(response?.data?.chats)) return response.data.chats;
  return [];
}

/** Robustly extract messages array from any API response shape */
function extractMessages(response: any): any[] {
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.messages)) return response.messages;
  return [];
}

/** Robustly extract contacts array from any API response shape */
function extractContacts(response: any): any[] {
  if (Array.isArray(response?.contacts)) return response.contacts;
  if (Array.isArray(response?.data?.contacts)) return response.data.contacts;
  if (Array.isArray(response?.data?.data)) return response.data.data;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response)) return response;
  return [];
}

/** Get cursor for the next page of chats */
function getNextChatCursor(response: any): string | null {
  if (response?.pageInfo?.hasNextPage) {
    return response.pageInfo.startCursor || response.pageInfo.endCursor || null;
  }
  return response?.nextCursor || response?.meta?.nextCursor || null;
}

/** Map raw API chat object → local Chat */
function mapApiChat(c: any): Chat {
  const id = String(c._id || c.id || Math.random().toString(36).substring(7));
  const rawName = c.name || c.phoneNumber || c.phone_number || 'CRM User';
  const initials = rawName ? rawName.charAt(0).toUpperCase() : '?';
  const ts = c.lastMessageTime || c.last_message_at || c.last_msg_received_at || c.updatedAt || new Date().toISOString();
  
  const clean = (val: any): string | null => {
    if (val === undefined || val === null) return null;
    const str = String(val).trim();
    if (str === '' || str === 'undefined' || str === 'null' || str === 'NaN') return null;
    return str;
  };

  const resolvedSocialAccountId = 
    clean(c.socialAccountId) ||
    clean(c.social_account_id) ||
    clean(c.accountId) ||
    clean(c.account_id) ||
    clean(c.rawData?.socialAccountId) ||
    clean(c.rawData?.social_account_id) ||
    clean(c.rawData?.accountId) ||
    clean(c.rawData?.account_id) ||
    clean(c.socialAccount?.phone_number_id) ||
    clean(c.socialAccount?.phoneNumberId) ||
    clean(c.socialAccount?.accountId) ||
    clean(c.socialAccount?.account_id) ||
    clean(c.sourceAccount?.phone_number_id) ||
    clean(c.sourceAccount?.phoneNumberId) ||
    clean(c.sourceAccount?.accountId) ||
    clean(c.sourceAccount?.account_id) ||
    clean(c.metadata?.phone_number_id) ||
    clean(c.metadata?.accountId) ||
    clean(c.metadata?.phoneNumberId) ||
    null;

  return {
    id,
    name: rawName,
    phoneNumber: c.phoneNumber || c.phone_number || null,
    channel: c.channel || null,
    lastMessage: c.lastMessage || c.last_message || null,
    unreadCount: Number(c.unreadCount ?? 0),
    avatar: c.avatar || initials,
    pinned: Boolean(c.isPinned),
    isStarred: Boolean(c.isStarred),
    isOpen: Boolean(c.isOpen),
    assignedToName: c.assignedTo?.name || null,
    leadStage: c.leadInfo?.status || c.leadStage || null,
    socialAccountId: resolvedSocialAccountId,
    updatedAt: typeof ts === 'number' ? new Date(ts).toISOString() : String(ts),
    isBlocked: Boolean(c.isBlocked),
    username: c.username || null,
    isCampaignChat: Boolean(c.isCampaignChat),
    accountId: resolvedSocialAccountId,
  };
}

/** Map raw API message object → local Message */
function mapApiMessage(m: any, chatId: string): Message {
  const id = String(m._id || m.id || m.messageId || m.message_id || m.message?.id || Math.random().toString(36).substring(7));
  const ts = m.createdAt || m.created_at || m.timestamp || m.message?.timestamp || new Date().toISOString();
  const type = m.message_type || m.type || m.message?.type || 'text';
  const isOutgoing = m.isOutgoing === true || 
                     m.fromCrm === true || 
                     String(m.flag || '').toLowerCase() === 'outgoing' ||
                     String(m.flag || '').toLowerCase() === 'send' ||
                     String(m.message?.flag || '').toLowerCase() === 'send';
  return {
    id,
    chatId,
    text: m.content || m.text || m.body || m.message?.text || m.message?.caption || '',
    sender: isOutgoing ? 'You' : (m.senderId || 'Contact'),
    isOutgoing,
    type,
    mediaUrl: m.mediaUrl || m.media_url || m.message?.image?.url || m.message?.video?.url || m.message?.audio?.url || m.message?.document?.url || null,
    status: m.status || 'sent',
    timestamp: typeof ts === 'number' ? new Date(ts).toISOString() : String(ts),
    readReceipt: m.status || null,
    isImage: type === 'image',
    rawJson: m ? JSON.stringify(m) : null,
  };
}

/** Upsert a chat row to SQLite */
async function upsertChat(chat: Chat) {
  await db
    .insert(chatsTable)
    .values(chat)
    .onConflictDoUpdate({
      target: chatsTable.id,
      set: {
        name: chat.name,
        phoneNumber: chat.phoneNumber,
        channel: chat.channel,
        lastMessage: chat.lastMessage,
        unreadCount: chat.unreadCount,
        avatar: chat.avatar,
        pinned: chat.pinned,
        isStarred: chat.isStarred,
        isOpen: chat.isOpen,
        assignedToName: chat.assignedToName,
        leadStage: chat.leadStage,
        socialAccountId: chat.socialAccountId,
        updatedAt: chat.updatedAt,
        accountId: chat.accountId,
        username: chat.username,
        isBlocked: chat.isBlocked,
        isCampaignChat: chat.isCampaignChat,
      },
    });
}

/** Upsert a message row to SQLite */
async function upsertMessage(msg: Message) {
  await db
    .insert(messagesTable)
    .values(msg)
    .onConflictDoUpdate({
      target: messagesTable.id,
      set: {
        text: msg.text,
        status: msg.status,
        readReceipt: msg.readReceipt,
        isImage: msg.isImage,
        isOutgoing: msg.isOutgoing,
        type: msg.type,
        mediaUrl: msg.mediaUrl,
        rawJson: msg.rawJson,
      },
    });
}

// ─── Store Interface ──────────────────────────────────────────────────────────

interface SyncState {
  chats: Chat[];
  contacts: Contact[];
  messagesByChat: Record<string, Message[]>;
  isSyncing: boolean;
  syncProgress: SyncProgress | null;
  lastSyncedAt: string | null;
  isAuthenticated: boolean;
  userEmail: string | null;
  userToken: string | null;
  selectedChatIds: Set<string>;
  tenantId: string | null;

  // local DB reads
  loadChats: () => Promise<void>;
  loadContacts: () => Promise<void>;
  loadMessages: (chatId: string) => Promise<void>;

  // local writes (optimistic)
  addLocalMessage: (chatId: string, text: string) => Promise<void>;
  addLocalContact: (contact: Omit<Contact, 'id'>) => Promise<void>;

  // selection actions
  setSelectedChatIds: (ids: Set<string>) => void;
  clearSelection: () => void;

  // backend sync (called after login and periodically)
  syncData: (apiChats: Chat[], apiContacts: Contact[]) => Promise<void>;
  syncWithBackend: () => Promise<void>;

  // auth
  login: (email: string, password?: string) => Promise<void>;
  logout: () => Promise<void>;

  // realtime socket events
  handleRealtimeMessage: (incoming: any) => Promise<void>;
  handleRealtimeStatus: (incoming: any) => Promise<void>;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useSyncStore = create<SyncState>((set, get) => ({
  chats: [],
  contacts: [],
  messagesByChat: {},
  isSyncing: false,
  syncProgress: null,
  lastSyncedAt: storage.getString(mmkvKeys.LAST_SYNCED_AT) || null,
  isAuthenticated: storage.getString(mmkvKeys.IS_AUTHENTICATED) === 'true',
  userEmail: storage.getString(mmkvKeys.USER_EMAIL) || null,
  userToken: storage.getString(mmkvKeys.USER_TOKEN) || null,
  tenantId: storage.getString(mmkvKeys.TENANT_ID) || null,
  selectedChatIds: new Set(),

  setSelectedChatIds: (ids: Set<string>) => set({ selectedChatIds: ids }),
  clearSelection: () => set({ selectedChatIds: new Set() }),


  // ── Auth ───────────────────────────────────────────────────────────────────

  login: async (email: string, password?: string) => {
    const response = await API.post('/auth/login', { email, password });
    const { token, tenantID, tenantId, user } = response.data;
    const actualTenantId = tenantID || tenantId || '';

    if (!token) {
      throw new Error(response.data?.message || 'Login failed: no token in response');
    }

    storage.set(mmkvKeys.IS_AUTHENTICATED, 'true');
    storage.set(mmkvKeys.USER_EMAIL, email);
    storage.set(mmkvKeys.USER_TOKEN, token);
    storage.set(mmkvKeys.TENANT_ID, actualTenantId);

    set({
      isAuthenticated: true,
      userEmail: email,
      userToken: token,
      tenantId: actualTenantId || null,
    });

    // Start background sync immediately without blocking navigation
    setTimeout(() => get().syncWithBackend(), 0);
  },

  logout: async () => {
    const token = get().userToken || storage.getString(mmkvKeys.USER_TOKEN);
    try {
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      await API.post('/auth/logout', {}, { headers });
    } catch (err) {
      console.warn('Logout API call failed (non-fatal):', err);
    }
    storage.remove(mmkvKeys.IS_AUTHENTICATED);
    storage.remove(mmkvKeys.USER_EMAIL);
    storage.remove(mmkvKeys.USER_TOKEN);
    storage.remove(mmkvKeys.TENANT_ID);

    // Purge local database contents on logout
    try {
      const { expoDb } = require('../db/client');
      await expoDb.execAsync('DELETE FROM chats;');
      await expoDb.execAsync('DELETE FROM contacts;');
      await expoDb.execAsync('DELETE FROM messages;');
    } catch (dbErr) {
      console.error('Failed to purge local database tables:', dbErr);
    }

    set({
      isAuthenticated: false,
      userEmail: null,
      userToken: null,
      tenantId: null,
      chats: [],
      contacts: [],
      messagesByChat: {},
      syncProgress: null,
    });
  },

  // ── Local DB reads ─────────────────────────────────────────────────────────

  loadChats: async () => {
    try {
      const result = await db.select().from(chatsTable).orderBy(desc(chatsTable.updatedAt));
      set({ chats: result as Chat[] });
    } catch (err) {
      console.error('Failed to load chats:', err);
    }
  },

  loadContacts: async () => {
    try {
      const result = await db.select().from(contactsTable);
      set({ contacts: result as Contact[] });
    } catch (err) {
      console.error('Failed to load contacts:', err);
    }
  },

  loadMessages: async (chatId: string) => {
    try {
      const result = await db
        .select()
        .from(messagesTable)
        .where(eq(messagesTable.chatId, chatId))
        .orderBy(desc(messagesTable.timestamp));

      set((state) => ({
        messagesByChat: {
          ...state.messagesByChat,
          [chatId]: result as Message[],
        },
      }));
    } catch (err) {
      console.error('Failed to load messages:', err);
    }
  },

  // ── Optimistic local writes ────────────────────────────────────────────────

  addLocalMessage: async (chatId: string, text: string) => {
    const messageId = Math.random().toString(36).substring(7);
    const timestamp = new Date().toISOString();

    const newMessage: Message = {
      id: messageId,
      chatId,
      text,
      sender: 'You',
      isOutgoing: true,
      type: 'text',
      mediaUrl: null,
      status: 'pending',
      timestamp,
      readReceipt: null,
      isImage: false,
      rawJson: null,
    };

    set((state) => {
      const chatMsgs = state.messagesByChat[chatId] || [];
      const updatedChats = state.chats
        .map((c) => c.id === chatId ? { ...c, lastMessage: text, updatedAt: timestamp } : c)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      return {
        messagesByChat: { ...state.messagesByChat, [chatId]: [newMessage, ...chatMsgs] },
        chats: updatedChats,
      };
    });

    try {
      await db.insert(messagesTable).values(newMessage);
      await db.update(chatsTable).set({ lastMessage: text, updatedAt: timestamp }).where(eq(chatsTable.id, chatId));
    } catch (err) {
      console.error('Failed to persist message locally:', err);
      get().loadChats();
      get().loadMessages(chatId);
    }
  },

  addLocalContact: async (contactDetails: Omit<Contact, 'id'>) => {
    const newContact: Contact = { ...contactDetails, id: Math.random().toString(36).substring(7) };
    set((state) => ({ contacts: [...state.contacts, newContact] }));
    try {
      await db.insert(contactsTable).values(newContact);
    } catch (err) {
      console.error('Failed to persist contact locally:', err);
      get().loadContacts();
    }
  },

  // ── Legacy batch helper (used by inbox seed logic) ─────────────────────────

  syncData: async (apiChats: Chat[], apiContacts: Contact[]) => {
    set({ isSyncing: true });
    try {
      for (const chat of apiChats) await upsertChat(chat);
      for (const contact of apiContacts) {
        await db.insert(contactsTable).values(contact).onConflictDoUpdate({
          target: contactsTable.id,
          set: {
            name: contact.name,
            username: contact.username,
            phone: contact.phone,
            channel: contact.channel,
            status: contact.status,
            subStatus: contact.subStatus,
            lastActivity: contact.lastActivity,
          },
        });
      }
      const now = new Date().toISOString();
      storage.set(mmkvKeys.LAST_SYNCED_AT, now);
      set({ isSyncing: false, lastSyncedAt: now });
      await get().loadChats();
      await get().loadContacts();
    } catch (err) {
      console.error('Failed to sync data:', err);
      set({ isSyncing: false });
    }
  },

  // ── Full backend sync (WhatsApp-style) ────────────────────────────────────

  syncWithBackend: async () => {
    const { isAuthenticated, userToken, isSyncing } = get();
    if (!isAuthenticated || !userToken || isSyncing) return;

    set({ isSyncing: true, syncProgress: { label: 'Syncing chats…', chatsSynced: 0, totalChats: 0, messagesSynced: 0 } });

    let cancelled = false;

    try {
      // ── Phase 1: Paginated chat fetch ──────────────────────────────────────
      const allChats: Chat[] = [];
      const seenIds = new Set<string>();
      let cursor: string | null = null;

      for (let page = 0; page < MAX_CHAT_PAGES; page++) {
        if (cancelled) return;

        const params: Record<string, any> = { limit: CHAT_PAGE_SIZE };
        if (cursor) params.after = cursor;

        let response: any;
        try {
          const res = await API.get('/chats/v2/all', { params });
          response = res.data;
        } catch (e) {
          console.error('[sync] chat page fetch failed:', e);
          break;
        }

        const pageChats = extractChats(response);
        if (pageChats.length === 0) break;

        for (const raw of pageChats) {
          const chat = mapApiChat(raw);
          if (!seenIds.has(chat.id)) {
            seenIds.add(chat.id);
            allChats.push(chat);
            await upsertChat(chat);
          }
        }

        set({ syncProgress: { label: 'Syncing chats…', chatsSynced: allChats.length, totalChats: allChats.length, messagesSynced: 0 } });

        // Refresh chat list in store immediately so UI shows real chats fast
        await get().loadChats();

        cursor = getNextChatCursor(response);
        if (!cursor) break;
      }

      // ── Phase 2: Fetch contacts ────────────────────────────────────────────
      try {
        const contactsRes = await API.get('/contacts', { params: { limit: 100 } });
        const rawContacts = extractContacts(contactsRes.data);

        for (const c of rawContacts) {
          const contact: Contact = {
            id: String(c._id || c.id || Math.random().toString(36).substring(7)),
            name: c.name || c.phoneNumber || 'CRM User',
            username: c.email || null,
            phone: c.phoneNumber || c.phone_number || null,
            channel: c.channel || null,
            status: (c.tags && c.tags.length > 0) ? c.tags[0] : null,
            subStatus: 'Active',
            lastActivity: c.updatedAt || c.createdAt || new Date().toISOString(),
          };
          await db.insert(contactsTable).values(contact).onConflictDoUpdate({
            target: contactsTable.id,
            set: { name: contact.name, username: contact.username, phone: contact.phone, channel: contact.channel, status: contact.status, subStatus: contact.subStatus, lastActivity: contact.lastActivity },
          });
        }
        await get().loadContacts();
      } catch (e) {
        console.warn('[sync] contacts fetch failed (non-fatal):', e);
      }

      // ── Phase 3: Fetch messages for the N most recent chats ───────────────
      const messageChats = allChats.slice(0, MAX_MESSAGE_CHATS);

      for (let i = 0; i < messageChats.length; i++) {
        if (cancelled) return;

        const chat = messageChats[i];
        set({ syncProgress: { label: 'Syncing messages…', chatsSynced: allChats.length, totalChats: allChats.length, messagesSynced: i } });

        try {
          const msgRes = await API.get(`/messages/${chat.id}/sync`, { params: { direction: 'older', limit: 50 } });
          const rawMsgs = extractMessages(msgRes.data);

          for (const m of rawMsgs) {
            await upsertMessage(mapApiMessage(m, chat.id));
          }

          // Update in-memory messagesByChat for this chat
          if (rawMsgs.length > 0) {
            await get().loadMessages(chat.id);
          }
        } catch (e) {
          console.warn(`[sync] messages for ${chat.id} failed (non-fatal):`, e);
        }
      }

      if (!cancelled) {
        const now = new Date().toISOString();
        storage.set(mmkvKeys.LAST_SYNCED_AT, now);
        set({ isSyncing: false, syncProgress: null, lastSyncedAt: now });
        await get().loadChats();
      }
    } catch (err) {
      console.error('[sync] syncWithBackend error:', err);
      if (!cancelled) {
        set({ isSyncing: false, syncProgress: null });
      }
    }
  },

  handleRealtimeMessage: async (incoming: any) => {
    try {
      const event = incoming?.payload && !incoming.chatId && !incoming.chat_id && !incoming.chatDetails
        ? incoming.payload
        : incoming;

      const chatId = String(
        event.chatId || 
        event.chat_id || 
        event.chat?._id || 
        event.chat?.id || 
        event.chatDetails?.chatId || 
        event.chatDetails?.chat_id || 
        event.chatDetails?._id || 
        ''
      );
      if (!chatId) return;

      // 1. Map and insert message
      const msg = mapApiMessage(incoming, chatId);
      await upsertMessage(msg);

      // 2. Map and update the corresponding chat's last message time & text
      const chatRes = await db.select().from(chatsTable).where(eq(chatsTable.id, chatId)).limit(1);
      if (chatRes.length > 0) {
        const chat = chatRes[0];
        const updatedChat: Chat = {
          ...chat,
          lastMessage: msg.text || chat.lastMessage,
          unreadCount: msg.isOutgoing ? chat.unreadCount : (chat.unreadCount + 1),
          updatedAt: msg.timestamp,
          accountId:  chat.accountId,
        };
        await upsertChat(updatedChat);
      } else {
        // If chat doesn't exist locally, fetch it from backend
        try {
          const res = await API.get(`/chats/${chatId}`);
          if (res.data?.data) {
            await upsertChat(mapApiChat(res.data.data));
          }
        } catch (_) {}
      }

      // 3. Reload in memory
      await get().loadChats();
      await get().loadMessages(chatId);

      // Trigger background prefetching for any media attachment in realtime message
      if (msg.type !== 'text' && msg.type !== 'unsupported') {
        try {
          const { prefetchChatMedia } = require('../db/client');
          prefetchChatMedia(chatId);
        } catch (_) {}
      }
    } catch (err) {
      console.error('[realtime] handleRealtimeMessage error:', err);
    }
  },

  handleRealtimeStatus: async (incoming: any) => {
    try {
      const msgId = String(incoming.messageId || incoming.message_id || incoming.id || incoming._id || '');
      const chatId = String(incoming.chatId || incoming.chat_id || '');
      const status = String(incoming.status || 'sent');

      if (!msgId) return;

      // Update in SQLite
      await db.update(messagesTable)
        .set({ status, readReceipt: status })
        .where(eq(messagesTable.id, msgId));

      // Reload in memory
      if (chatId) {
        await get().loadMessages(chatId);
      }
    } catch (err) {
      console.error('[realtime] handleRealtimeStatus error:', err);
    }
  },
}));
