import { create } from 'zustand';
import { db, upsertChatBatch, upsertMessageBatch, upsertContactBatch } from '../db/client';
import { chats as chatsTable, messages as messagesTable, contacts as contactsTable } from '../db/schema';
import { eq, desc, and, lt } from 'drizzle-orm';
import { storage, mmkvKeys } from './mmkv';
import API from '../config/axios';
import { playNotificationSound } from '../lib/audioNotification';

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
  departmentId: string | null;
  quickAssistKeyword: string | null;
  campaignId: string | null;
  updatedAt: string;
  isCampaignChat: boolean;
  rawJson: string | null;
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

export interface ReplyToContext {
  id?: string;
  messageId?: string;
  senderName?: string;
  sender?: string;
  text?: string;
  content?: string;
  type?: string;
  message_type?: string;
  mediaUrl?: string;
  fileName?: string;
  uploaded_id?: string;
  isOutgoing?: boolean;
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
  step?: number;
  totalSteps?: number;
  chatsSynced: number;
  totalChats: number;
  messagesSynced: number;
  totalMessagesToSync?: number;
  percentage?: number;
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

/** Robustly extract and flatten messages array from any API response shape (including date groups) */
export function extractMessages(response: any): any[] {
  let list: any[] = [];
  if (Array.isArray(response?.data?.messages)) list = response.data.messages;
  else if (Array.isArray(response?.data)) list = response.data;
  else if (Array.isArray(response?.messages)) list = response.messages;
  else if (Array.isArray(response)) list = response;

  // Flatten if the array contains date groups { _id: "YYYY-MM-DD", messages: [...] }
  const flattened: any[] = [];
  for (const item of list) {
    if (item && Array.isArray(item.messages)) {
      flattened.push(...item.messages);
    } else if (item) {
      flattened.push(item);
    }
  }
  return flattened;
}

/** Robustly extract contacts array from any API response shape */
export function extractContacts(response: any): any[] {
  if (Array.isArray(response?.contacts)) return response.contacts;
  if (Array.isArray(response?.data?.contacts)) return response.data.contacts;
  if (Array.isArray(response?.data?.data)) return response.data.data;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response)) return response;
  return [];
}

/** Get cursor for the next page of chats */
export function getNextChatCursor(response: any): string | null {
  if (!response) return null;

  // Stop if explicitly hasMore is false or hasNextPage is false
  if (response.hasMore === false || response.data?.hasMore === false) return null;
  if (response.pageInfo?.hasMore === false || response.data?.pageInfo?.hasMore === false) return null;
  if (response.pageInfo?.hasNextPage === false || response.data?.pageInfo?.hasNextPage === false) return null;

  if (response.pageInfo?.hasNextPage || response.pageInfo?.hasMore) {
    return response.pageInfo.startCursor || response.pageInfo.endCursor || null;
  }
  if (response.data?.pageInfo?.hasNextPage || response.data?.pageInfo?.hasMore) {
    return response.data.pageInfo.startCursor || response.data.pageInfo.endCursor || null;
  }
  return response.nextCursor || response.meta?.nextCursor || response.data?.nextCursor || null;
}

/** Check if API response indicates there are more chats */
export function checkHasMoreChats(response: any, rawChatsCount?: number, limit?: number): boolean {
  if (!response) return false;

  // Check explicit hasMore / hasNextPage boolean flags
  if (response.hasMore === false || response.data?.hasMore === false) return false;
  if (response.pageInfo?.hasMore === false || response.data?.pageInfo?.hasMore === false) return false;
  if (response.pageInfo?.hasNextPage === false || response.data?.pageInfo?.hasNextPage === false) return false;

  if (response.hasMore === true || response.data?.hasMore === true) return true;
  if (response.pageInfo?.hasMore === true || response.data?.pageInfo?.hasMore === true) return true;
  if (response.pageInfo?.hasNextPage === true || response.data?.pageInfo?.hasNextPage === true) return true;

  if (rawChatsCount !== undefined && rawChatsCount === 0) return false;
  if (limit !== undefined && rawChatsCount !== undefined && rawChatsCount < limit) return false;

  const nextCursor = getNextChatCursor(response);
  return Boolean(nextCursor);
}

/** Map raw API chat object → local Chat */
export function mapApiChat(c: any): Chat {
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

  // Extract Department ID
  const deps = c.departments || c.chat?.departments || c.department || [];
  const firstDep = Array.isArray(deps) ? deps[0] : deps;
  const resolvedDeptId = firstDep ? String(firstDep._id || firstDep.id || firstDep) : null;

  // Extract Quick Assist Keyword
  const qaKeyword = c.latestQuickAssistKeyword || c.chat?.latestQuickAssistKeyword || c.quickAssistKeyword || null;

  // Extract Campaign ID
  const camp = c.campaignId || c.chat?.campaignId || c.campaign || c.chat?.campaign || null;
  const resolvedCampId = camp ? (typeof camp === 'object' ? String(camp._id || camp.id || '') : String(camp)) : null;

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
    departmentId: resolvedDeptId,
    quickAssistKeyword: qaKeyword ? String(qaKeyword) : null,
    campaignId: resolvedCampId,
    updatedAt: typeof ts === 'number' ? new Date(ts).toISOString() : String(ts),
    isBlocked: Boolean(c.isBlocked),
    username: c.username || null,
    isCampaignChat: Boolean(c.isCampaignChat),
    accountId: resolvedSocialAccountId,
    rawJson: c ? JSON.stringify(c) : null,
  };
}

/** Map raw API message object → local Message */
export function mapApiMessage(m: any, chatId: string): Message {
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
        departmentId: chat.departmentId,
        quickAssistKeyword: chat.quickAssistKeyword,
        campaignId: chat.campaignId,
        updatedAt: chat.updatedAt,
        accountId: chat.accountId,
        username: chat.username,
        isBlocked: chat.isBlocked,
        isCampaignChat: chat.isCampaignChat,
        rawJson: chat.rawJson,
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
  tenantId: string | null;
  selectedChatIds: Set<string>;
  activeChatId: string | null;
  setActiveChatId: (id: string | null) => void;

  isInitialSync: boolean;
  setIsInitialSync: (val: boolean) => void;

  // User Profile
  userId: string | null;
  userName: string | null;
  userRole: string | null;

  updateMessageStatus: (chatId: string, messageId: string, status: string) => Promise<void>;

  // local DB reads
  loadChats: () => Promise<void>;
  loadContacts: () => Promise<void>;
  loadMessages: (chatId: string) => Promise<number>;
  loadOlderMessages: (chatId: string, limit?: number) => Promise<number>;
  appendOlderMessages: (chatId: string, newMsgs: Message[]) => void;

  // chat list pagination
  lastChatCursor: string | null;
  hasMoreChats: boolean;
  isLoadingMoreChats: boolean;
  loadMoreChats: () => Promise<number>;

  // local writes (optimistic)
  addLocalMessage: (chatId: string, text: string, replyTo?: ReplyToContext | null) => Promise<void>;
  addLocalContact: (contact: Omit<Contact, 'id'>) => Promise<void>;

  // selection & bulk actions
  setSelectedChatIds: (ids: Set<string>) => void;
  clearSelection: () => void;
  bulkSetStarred: (chatIds: string[], isStarred: boolean) => Promise<void>;
  bulkSetPinned: (chatIds: string[], pinned: boolean) => Promise<void>;

  // backend sync (called after login and periodically)
  syncData: (apiChats: Chat[], apiContacts: Contact[]) => Promise<void>;
  syncWithBackend: () => Promise<void>;
  fetchCurrentUser: () => Promise<void>;

  // auth
  login: (email: string, password?: string) => Promise<void>;
  logout: () => Promise<void>;

  // realtime socket events
  handleRealtimeMessage: (incoming: any) => Promise<void>;
  handleRealtimeStatus: (incoming: any) => Promise<void>;

  // reset unread count
  resetUnreadCount: (chatId: string) => Promise<void>;

  // filter caching
  fetchAndCacheFilterOptions: () => Promise<void>;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useSyncStore = create<SyncState>((set, get) => ({
  chats: [],
  contacts: [],
  messagesByChat: {},
  isSyncing: false,
  isInitialSync: false,
  setIsInitialSync: (val: boolean) => set({ isInitialSync: val }),
  syncProgress: null,
  lastSyncedAt: storage.getString(mmkvKeys.LAST_SYNCED_AT) || null,
  isAuthenticated: storage.getString(mmkvKeys.IS_AUTHENTICATED) === 'true',
  userEmail: storage.getString(mmkvKeys.USER_EMAIL) || null,
  userToken: storage.getString(mmkvKeys.USER_TOKEN) || null,
  tenantId: storage.getString(mmkvKeys.TENANT_ID) || null,
  selectedChatIds: new Set(),
  activeChatId: null,
  setActiveChatId: (id: string | null) => set({ activeChatId: id }),

  lastChatCursor: null,
  hasMoreChats: true,
  isLoadingMoreChats: false,

  userId: storage.getString(mmkvKeys.USER_ID) || null,
  userName: storage.getString(mmkvKeys.USER_NAME) || null,
  userRole: storage.getString(mmkvKeys.USER_ROLE) || null,

  setSelectedChatIds: (ids: Set<string>) => set({ selectedChatIds: ids }),
  clearSelection: () => set({ selectedChatIds: new Set() }),

  bulkSetStarred: async (chatIds: string[], isStarred: boolean) => {
    if (chatIds.length === 0) return;
    const idSet = new Set(chatIds);
    // 1. Optimistic state update
    set((state) => ({
      chats: state.chats.map((c) => (idSet.has(c.id) ? { ...c, isStarred } : c)),
      selectedChatIds: new Set(),
    }));

    // 2. Single atomic SQLite batch transaction
    try {
      const { expoDb } = require('../db/client');
      await expoDb.withTransactionAsync(async () => {
        for (const id of chatIds) {
          await db.update(chatsTable).set({ isStarred }).where(eq(chatsTable.id, id));
        }
      });
    } catch (e) {
      console.error('[bulkStar] db error:', e);
    }

    // 3. Parallel background API calls
    Promise.allSettled(
      chatIds.map((id) => API.patch(`/chats/toggle-chat-star/${id}`))
    ).catch(() => { });
  },

  bulkSetPinned: async (chatIds: string[], pinned: boolean) => {
    if (chatIds.length === 0) return;
    const idSet = new Set(chatIds);
    // 1. Optimistic state update with re-sort
    set((state) => {
      const next = state.chats.map((c) => (idSet.has(c.id) ? { ...c, pinned } : c));
      next.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
      return { chats: next, selectedChatIds: new Set() };
    });

    // 2. Single atomic SQLite batch transaction
    try {
      const { expoDb } = require('../db/client');
      await expoDb.withTransactionAsync(async () => {
        for (const id of chatIds) {
          await db.update(chatsTable).set({ pinned }).where(eq(chatsTable.id, id));
        }
      });
    } catch (e) {
      console.error('[bulkPin] db error:', e);
    }

    // 3. Parallel background API calls
    Promise.allSettled(
      chatIds.map((id) => API.patch(`/chats/toggle-chat-pin/${id}`))
    ).catch(() => { });
  },

  fetchCurrentUser: async () => {
    try {
      const response = await API.get('/auth/me');
      const userObj = response.data?.user || response.data?.data?.clientUser || response.data?.data?.user;
      if (userObj) {
        const userId = userObj._id || userObj.id || '';
        const userName = response.data?.data?.clientName || userObj.username || userObj.name || '';
        const userRole = response.data?.data?.rolename || response.data?.data?.roledashboard || userObj.role || '';

        storage.set(mmkvKeys.USER_ID, userId);
        storage.set(mmkvKeys.USER_NAME, userName);
        storage.set(mmkvKeys.USER_ROLE, userRole);

        set({ userId, userName, userRole });
      }
    } catch (err) {
      console.warn('Failed to fetch user profile:', err);
    }
  },

  updateMessageStatus: async (chatId: string, messageId: string, status: string) => {
    try {
      await db.update(messagesTable)
        .set({ status, readReceipt: status })
        .where(eq(messagesTable.id, messageId));

      set((state) => {
        const msgs = state.messagesByChat[chatId];
        if (!msgs) return state;
        return {
          messagesByChat: {
            ...state.messagesByChat,
            [chatId]: msgs.map((m) =>
              m.id === messageId ? { ...m, status, readReceipt: status } : m
            ),
          },
        };
      });
    } catch (err) {
      console.error('Failed to update message status:', err);
    }
  },


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

    const actualUser = user || {};
    const userId = actualUser._id || actualUser.id || '';
    const userName = response.data?.clientName || actualUser.username || actualUser.name || '';
    const userRole = response.data?.rolename || response.data?.roledashboard || actualUser.role || '';

    storage.set(mmkvKeys.USER_ID, userId);
    storage.set(mmkvKeys.USER_NAME, userName);
    storage.set(mmkvKeys.USER_ROLE, userRole);

    set({
      isAuthenticated: true,
      isInitialSync: true,
      userEmail: email,
      userToken: token,
      tenantId: actualTenantId || null,
      userId,
      userName,
      userRole,
    });
  },

  logout: async () => {
    const token = get().userToken || storage.getString(mmkvKeys.USER_TOKEN);
    if (token) {
      try {
        const headers: Record<string, string> = {
          'Authorization': `Bearer ${token}`
        };
        await API.post('/auth/logout', {}, { headers });
      } catch (err) {
        console.warn('Logout API call failed (non-fatal):', err);
      }
    }
    storage.remove(mmkvKeys.IS_AUTHENTICATED);
    storage.remove(mmkvKeys.USER_EMAIL);
    storage.remove(mmkvKeys.USER_TOKEN);
    storage.remove(mmkvKeys.TENANT_ID);
    storage.remove(mmkvKeys.USER_ID);
    storage.remove(mmkvKeys.USER_NAME);
    storage.remove(mmkvKeys.USER_ROLE);

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
      userId: null,
      userName: null,
      userRole: null,
      chats: [],
      contacts: [],
      messagesByChat: {},
      syncProgress: null,
    });
  },

  // ── Local DB reads ─────────────────────────────────────────────────────────

  loadChats: async () => {
    try {
      const result = await db.select().from(chatsTable).orderBy(desc(chatsTable.updatedAt)).limit(100);
      set({ chats: result as Chat[] });
    } catch (err) {
      console.error('Failed to load chats:', err);
    }
  },

  loadMoreChats: async (): Promise<number> => {
    const state = get();
    if (state.isLoadingMoreChats || !state.hasMoreChats) return 0;
    set({ isLoadingMoreChats: true });

    try {
      // 1. First check if SQLite has more cached chats not yet loaded into memory
      const currentCount = state.chats.length;
      const localResults = await db
        .select()
        .from(chatsTable)
        .orderBy(desc(chatsTable.updatedAt))
        .limit(50)
        .offset(currentCount);

      if (localResults.length > 0) {
        const localChats = localResults as Chat[];
        set((s) => ({
          chats: [...s.chats, ...localChats],
          isLoadingMoreChats: false,
        }));
        return localChats.length;
      }

      // 2. If SQLite has no more local chats, check hasMoreChats before background API sync
      if (!get().hasMoreChats) {
        set({ isLoadingMoreChats: false });
        return 0;
      }

      const params: Record<string, any> = { limit: 40 };
      if (state.lastChatCursor) {
        params.after = state.lastChatCursor;
      }

      const res = await API.get('/chats/v2/all', { params });
      const rawChats = extractChats(res.data);
      const hasMore = checkHasMoreChats(res.data, rawChats.length, 40);

      if (rawChats.length === 0 || !hasMore) {
        if (rawChats.length > 0) {
          const mappedChats = rawChats.map(mapApiChat);
          await upsertChatBatch(mappedChats);
          set((s) => {
            const existingIds = new Set(s.chats.map((c) => c.id));
            const newUnique = mappedChats.filter((c) => !existingIds.has(c.id));
            return {
              chats: [...s.chats, ...newUnique],
              lastChatCursor: null,
              hasMoreChats: false,
              isLoadingMoreChats: false,
            };
          });
          return mappedChats.length;
        }

        set({ hasMoreChats: false, isLoadingMoreChats: false, lastChatCursor: null });
        return 0;
      }

      const mappedChats = rawChats.map(mapApiChat);
      await upsertChatBatch(mappedChats);
      const nextCursor = getNextChatCursor(res.data);

      set((s) => {
        const existingIds = new Set(s.chats.map((c) => c.id));
        const newUnique = mappedChats.filter((c) => !existingIds.has(c.id));
        return {
          chats: [...s.chats, ...newUnique],
          lastChatCursor: nextCursor,
          hasMoreChats: Boolean(nextCursor),
          isLoadingMoreChats: false,
        };
      });

      return mappedChats.length;
    } catch (err) {
      console.error('[sync] loadMoreChats error:', err);
      set({ isLoadingMoreChats: false });
      return 0;
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

  loadMessages: async (chatId: string): Promise<number> => {
    try {
      const result = await db
        .select()
        .from(messagesTable)
        .where(eq(messagesTable.chatId, chatId))
        .orderBy(desc(messagesTable.timestamp))
        .limit(60);

      set((state) => ({
        messagesByChat: {
          ...state.messagesByChat,
          [chatId]: result as Message[],
        },
      }));
      return result.length;
    } catch (err) {
      console.error('Failed to load messages:', err);
      return 0;
    }
  },

  loadOlderMessages: async (chatId: string, limit = 40): Promise<number> => {
    try {
      const currentMsgs = get().messagesByChat[chatId] || [];
      if (currentMsgs.length === 0) {
        await get().loadMessages(chatId);
        return (get().messagesByChat[chatId] || []).length;
      }

      const oldestMsg = currentMsgs[currentMsgs.length - 1];
      const oldestTs = oldestMsg.timestamp;

      // Query local SQLite for messages older than the oldest in memory
      const olderFromDb = await db
        .select()
        .from(messagesTable)
        .where(
          and(
            eq(messagesTable.chatId, chatId),
            lt(messagesTable.timestamp, oldestTs)
          )
        )
        .orderBy(desc(messagesTable.timestamp))
        .limit(limit);

      if (olderFromDb.length > 0) {
        const existingIds = new Set(currentMsgs.map((m) => m.id));
        const newUnique = (olderFromDb as Message[]).filter((m) => !existingIds.has(m.id));

        if (newUnique.length > 0) {
          set((state) => ({
            messagesByChat: {
              ...state.messagesByChat,
              [chatId]: [...(state.messagesByChat[chatId] || []), ...newUnique],
            },
          }));
          return newUnique.length;
        }
      }

      return 0;
    } catch (err) {
      console.error('Failed to load older messages from db:', err);
      return 0;
    }
  },

  appendOlderMessages: (chatId: string, newMsgs: Message[]) => {
    if (!newMsgs || newMsgs.length === 0) return;
    set((state) => {
      const current = state.messagesByChat[chatId] || [];
      const existingIds = new Set(current.map((m) => m.id));
      const filtered = newMsgs.filter((m) => !existingIds.has(m.id));
      if (filtered.length === 0) return state;

      const combined = [...current, ...filtered];
      // Keep sorted descending by timestamp
      combined.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      return {
        messagesByChat: {
          ...state.messagesByChat,
          [chatId]: combined,
        },
      };
    });
  },

  // ── Optimistic local writes ────────────────────────────────────────────────

  addLocalMessage: async (chatId: string, text: string, replyTo?: ReplyToContext | null) => {
    console.dir({ replyTo }, { depth: null })
    const messageId = `temp_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const timestamp = new Date().toISOString();

    const effectiveReplyMsgId = replyTo?.messageId || replyTo?.id || null;
    const effectiveReplyTo = replyTo ? {
      messageId: replyTo.messageId || replyTo.id,
      message_type: replyTo.message_type || replyTo.type || 'text',
      content: replyTo.content || replyTo.text || '',
      sender: replyTo.sender || replyTo.senderName || '',
      fileName: replyTo.fileName || '',
      uploaded_id: replyTo.uploaded_id || '',
    } : null;

    const chat = get().chats.find((c) => c.id === chatId);

    const rawJsonObj = {
      _id: messageId,
      tempId: messageId,
      chatId,
      chat_id: chatId,
      flag: 'outgoing',
      fromCrm: true,
      outgoing: true,
      channel: chat?.channel || 'whatsapp',
      status: 1,
      isOptimistic: true,
      message_type: 'text',
      created_at: timestamp,
      createdAt: timestamp,
      timestamp: Date.now(),
      user: {
        clientUserID: get().userId || null,
        clientId: get().userId || null,
        name: get().userName || '',
        username: get().userName || '',
        role: get().userRole || 'Client',
        roleName: get().userRole || 'Client',
      },
      sentByUserId: get().userId || '',
      sentByName: get().userName || '',
      sentByUsername: get().userName || '',
      sentByRole: get().userRole || '',
      ...(effectiveReplyTo ? { reply_to: effectiveReplyTo } : {}),
      message: {
        id: messageId,
        replyMsgId: effectiveReplyMsgId,
        timestamp,
        type: 'text',
        text,
      },
    };

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
      rawJson: JSON.stringify(rawJsonObj),
    };

    set((state) => {
      const chatMsgs = state.messagesByChat[chatId] || [];
      let updatedChat: Chat | undefined;
      const otherChats: Chat[] = [];

      for (const c of state.chats) {
        if (c.id === chatId) {
          updatedChat = { ...c, lastMessage: text, updatedAt: timestamp };
        } else {
          otherChats.push(c);
        }
      }

      let nextChats = state.chats;
      if (updatedChat) {
        if (updatedChat.pinned) {
          nextChats = [updatedChat, ...otherChats];
        } else {
          const pinnedChats: Chat[] = [];
          const unpinnedChats: Chat[] = [];
          for (const c of otherChats) {
            if (c.pinned) pinnedChats.push(c);
            else unpinnedChats.push(c);
          }
          nextChats = [...pinnedChats, updatedChat, ...unpinnedChats];
        }
      }

      return {
        messagesByChat: { ...state.messagesByChat, [chatId]: [newMessage, ...chatMsgs] },
        chats: nextChats,
      };
    });

    try {
      await db.insert(messagesTable).values(newMessage);
      await db.update(chatsTable).set({ lastMessage: text, updatedAt: timestamp }).where(eq(chatsTable.id, chatId));
    } catch (err) {
      console.error('Failed to persist message locally:', err);
      get().loadChats();
      get().loadMessages(chatId);
      return;
    }

    // Emit standard Socket.io event for message sending
    try {
      const { getSocket } = require('../lib/socketConnection');
      const socket = getSocket();

      if (!socket || !socket.connected) {
        console.warn('Socket not initialized or disconnected. Marking message as failed.');
        await get().updateMessageStatus(chatId, messageId, 'failed');
        return;
      }

      const chat = get().chats.find((c) => c.id === chatId);
      let recipientPhone = chat?.phoneNumber || '';
      if (!recipientPhone) {
        try {
          const dbRes = await db.select().from(chatsTable).where(eq(chatsTable.id, chatId)).limit(1);
          if (dbRes.length > 0 && dbRes[0].phoneNumber) {
            recipientPhone = dbRes[0].phoneNumber;
          }
        } catch (_) { }
      }

      const payload = {
        type: 'text',
        to: recipientPhone,
        display_phone_number: recipientPhone,
        phone_number: recipientPhone,
        chatId: chat?.id || '',
        channel: chat?.channel || 'whatsapp',
        phone_number_id: chat?.accountId || '',
        accountId: chat?.accountId || '',
        user: {
          clientUserID: get().userId || null,
          clientId: get().userId || null,
          name: get().userName || '',
          username: get().userName || '',
          role: get().userRole || 'Client',
          roleName: get().userRole || 'Client',
        },
        tempId: messageId,
        replyMsgId: effectiveReplyMsgId,
        ...(effectiveReplyTo ? { reply_to: effectiveReplyTo } : {}),
        message: {
          replyMsgId: effectiveReplyMsgId,
          text: {
            body: text,
          },
        },
      };

      // console.log('🔌 [SOCKET SEND] Payload:', JSON.stringify(payload, null, 2));

      socket.emit("message:send", payload, async (res: any) => {
        if (!res || !res.success) {
          console.warn('Socket message sending failed:', res);
          await get().updateMessageStatus(chatId, messageId, 'failed');
        } else {
          const backendMsg = res.data || {};
          const backendId = String(backendMsg._id || backendMsg.id || messageId);
          const backendStatus = backendMsg.status || 'sent';
          const backendTime = backendMsg.createdAt || backendMsg.timestamp || new Date().toISOString();

          try {
            if (backendId !== messageId) {
              // Delete optimistic pending entry
              await db.delete(messagesTable).where(eq(messagesTable.id, messageId));

              // Insert confirmed message entry
              const confirmedMsg: Message = {
                ...newMessage,
                id: backendId,
                status: backendStatus,
                readReceipt: backendStatus,
                timestamp: new Date(backendTime).toISOString(),
                rawJson: JSON.stringify(backendMsg),
              };
              await db.insert(messagesTable).values(confirmedMsg);

              // Update Zustand
              set((state) => {
                const chatMsgs = state.messagesByChat[chatId] || [];
                const filtered = chatMsgs.filter((m) => m.id !== messageId);
                return {
                  messagesByChat: {
                    ...state.messagesByChat,
                    [chatId]: [confirmedMsg, ...filtered],
                  },
                };
              });
            } else {
              // Update existing status
              await get().updateMessageStatus(chatId, messageId, backendStatus);
            }
          } catch (dbErr) {
            console.error('Failed to update confirmed message in DB:', dbErr);
          }
        }
      });
    } catch (socketErr) {
      console.error('Failed to emit message send socket event:', socketErr);
      await get().updateMessageStatus(chatId, messageId, 'failed');
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
      await upsertChatBatch(apiChats);
      await upsertContactBatch(apiContacts);
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

    set({
      isSyncing: true,
      syncProgress: {
        label: 'Connecting to server…',
        step: 1,
        totalSteps: 4,
        chatsSynced: 0,
        totalChats: 0,
        messagesSynced: 0,
        percentage: 5,
      },
    });

    let cancelled = false;

    try {
      try {
        await get().fetchCurrentUser();
      } catch (e) {
        console.warn('[sync] fetchCurrentUser failed:', e);
      }

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
        if (pageChats.length === 0) {
          set({ lastChatCursor: null, hasMoreChats: false });
          break;
        }

        const pageChatsMapped: Chat[] = [];
        for (const raw of pageChats) {
          const chat = mapApiChat(raw);
          if (!seenIds.has(chat.id)) {
            seenIds.add(chat.id);
            allChats.push(chat);
            pageChatsMapped.push(chat);
          }
        }
        await upsertChatBatch(pageChatsMapped);

        set({
          syncProgress: {
            label: `Syncing chats (${allChats.length} downloaded)…`,
            step: 1,
            totalSteps: 4,
            chatsSynced: allChats.length,
            totalChats: allChats.length,
            messagesSynced: 0,
            percentage: Math.min(45, Math.round(10 + ((page + 1) / MAX_CHAT_PAGES) * 35)),
          },
        });

        // Refresh chat list in store immediately so UI shows real chats fast
        await get().loadChats();

        const hasMore = checkHasMoreChats(response, pageChats.length, CHAT_PAGE_SIZE);
        cursor = getNextChatCursor(response);
        set({ lastChatCursor: cursor, hasMoreChats: hasMore && Boolean(cursor) });
        if (!cursor || !hasMore) {
          set({ lastChatCursor: null, hasMoreChats: false });
          break;
        }
      }

      // ── Phase 2: Fetch contacts ────────────────────────────────────────────
      try {
        set({
          syncProgress: {
            label: 'Syncing contacts…',
            step: 2,
            totalSteps: 4,
            chatsSynced: allChats.length,
            totalChats: allChats.length,
            messagesSynced: 0,
            percentage: 50,
          },
        });
        const contactsRes = await API.get('/contacts', { params: { limit: 100 } });
        const rawContacts = extractContacts(contactsRes.data);

        const contactsToUpsert: Contact[] = rawContacts.map((c) => ({
          id: String(c._id || c.id || Math.random().toString(36).substring(7)),
          name: c.name || c.phoneNumber || 'CRM User',
          username: c.email || null,
          phone: c.phoneNumber || c.phone_number || null,
          channel: c.channel || null,
          status: (c.tags && c.tags.length > 0) ? c.tags[0] : null,
          subStatus: 'Active',
          lastActivity: c.updatedAt || c.createdAt || new Date().toISOString(),
        }));
        await upsertContactBatch(contactsToUpsert);
        await get().loadContacts();
      } catch (e) {
        console.warn('[sync] contacts fetch failed (non-fatal):', e);
      }

      // ── Phase 3: Fetch messages for the N most recent chats ───────────────
      const messageChats = allChats.slice(0, MAX_MESSAGE_CHATS);

      for (let i = 0; i < messageChats.length; i++) {
        if (cancelled) return;

        const chat = messageChats[i];
        set({
          syncProgress: {
            label: `Downloading messages (${i + 1}/${messageChats.length})…`,
            step: 3,
            totalSteps: 4,
            chatsSynced: allChats.length,
            totalChats: allChats.length,
            messagesSynced: i + 1,
            totalMessagesToSync: messageChats.length,
            percentage: Math.min(92, 50 + Math.round(((i + 1) / messageChats.length) * 42)),
          },
        });

        try {
          const msgRes = await API.get(`/messages/${chat.id}/sync`, { params: { direction: 'older', limit: 50 } });
          const rawMsgs = extractMessages(msgRes.data);

          if (rawMsgs.length > 0) {
            const mappedMsgs = rawMsgs.map((m) => mapApiMessage(m, chat.id));
            await upsertMessageBatch(mappedMsgs);
            // Update in-memory messagesByChat for this chat
            await get().loadMessages(chat.id);
          }
        } catch (e) {
          console.warn(`[sync] messages for ${chat.id} failed (non-fatal):`, e);
        }
      }

      // ── Phase 4: Fetch & Cache Filter Options & Templates ──────────────────
      set({
        syncProgress: {
          label: 'Setting up templates & filters…',
          step: 4,
          totalSteps: 4,
          chatsSynced: allChats.length,
          totalChats: allChats.length,
          messagesSynced: messageChats.length,
          totalMessagesToSync: messageChats.length,
          percentage: 96,
        },
      });
      await get().fetchAndCacheFilterOptions();

      if (!cancelled) {
        const now = new Date().toISOString();
        storage.set(mmkvKeys.LAST_SYNCED_AT, now);
        set({
          isSyncing: false,
          isInitialSync: false,
          syncProgress: {
            label: 'All caught up!',
            step: 4,
            totalSteps: 4,
            chatsSynced: allChats.length,
            totalChats: allChats.length,
            messagesSynced: messageChats.length,
            totalMessagesToSync: messageChats.length,
            percentage: 100,
          },
          lastSyncedAt: now,
        });
        await get().loadChats();

        // Clear progress after short completion moment
        setTimeout(() => {
          if (!get().isSyncing) {
            set({ syncProgress: null });
          }
        }, 1200);
      }
    } catch (err) {
      console.error('[sync] syncWithBackend error:', err);
      if (!cancelled) {
        set({ isSyncing: false, isInitialSync: false, syncProgress: null });
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
        incoming.chatId ||
        incoming.chat_id ||
        incoming.message?.chatId ||
        incoming.message?.chat_id ||
        ''
      );
      if (!chatId) return;

      // 1. Map and insert message
      const msg = mapApiMessage(incoming, chatId);
      await upsertMessage(msg);

      const isActiveChat = get().activeChatId === chatId;

      // 2. Play notification sound on incoming messages when not active in this chat
      if (!msg.isOutgoing && !isActiveChat) {
        playNotificationSound();
      }

      // 3. Update SQLite chat & calculate accurate unread count
      const chatRes = await db.select().from(chatsTable).where(eq(chatsTable.id, chatId)).limit(1);
      const existingDbChat = chatRes.length > 0 ? chatRes[0] : null;

      const currentUnread = existingDbChat ? Number(existingDbChat.unreadCount || 0) : 0;
      const computedUnread = isActiveChat
        ? 0
        : msg.isOutgoing
          ? currentUnread
          : (event.chatDetails?.unreadCount !== undefined
            ? Number(event.chatDetails.unreadCount)
            : currentUnread + 1);

      let targetChat: Chat;
      if (existingDbChat) {
        targetChat = {
          ...existingDbChat,
          lastMessage: msg.text || existingDbChat.lastMessage,
          unreadCount: computedUnread,
          updatedAt: msg.timestamp,
        };
      } else if (event.chatDetails || event.chat) {
        targetChat = mapApiChat(event.chatDetails || event.chat);
        targetChat.lastMessage = msg.text || targetChat.lastMessage;
        targetChat.unreadCount = computedUnread;
        targetChat.updatedAt = msg.timestamp;
      } else {
        targetChat = {
          id: chatId,
          name: incoming.senderName || incoming.name || incoming.phoneNumber || 'Contact',
          username: null,
          phoneNumber: incoming.phoneNumber || null,
          channel: incoming.channel || 'whatsapp',
          accountId: null,
          lastMessage: msg.text || '',
          unreadCount: computedUnread,
          avatar: '?',
          pinned: false,
          isStarred: false,
          isOpen: true,
          isBlocked: false,
          assignedToName: null,
          leadStage: null,
          socialAccountId: null,
          departmentId: null,
          quickAssistKeyword: null,
          campaignId: null,
          updatedAt: msg.timestamp,
          isCampaignChat: false,
          rawJson: null,
        };
      }

      await upsertChat(targetChat);

      // 4. Update in-memory state and move targetChat to the top
      set((state) => {
        const otherChats = state.chats.filter((c) => c.id !== chatId);
        let nextChats: Chat[];

        if (targetChat.pinned) {
          const otherPinned = otherChats.filter((c) => c.pinned);
          const unpinned = otherChats.filter((c) => !c.pinned);
          nextChats = [targetChat, ...otherPinned, ...unpinned];
        } else {
          const pinned = otherChats.filter((c) => c.pinned);
          const unpinned = otherChats.filter((c) => !c.pinned);
          nextChats = [...pinned, targetChat, ...unpinned];
        }

        const activeChatMsgs = state.messagesByChat[chatId];
        const nextMsgs = activeChatMsgs
          ? [msg, ...activeChatMsgs.filter((m) => m.id !== msg.id)]
          : undefined;

        return {
          chats: nextChats,
          ...(nextMsgs ? { messagesByChat: { ...state.messagesByChat, [chatId]: nextMsgs } } : {}),
        };
      });
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

      // Fast incremental status update in memory
      if (chatId) {
        set((state) => {
          const activeMsgs = state.messagesByChat[chatId];
          if (!activeMsgs) return state;
          return {
            messagesByChat: {
              ...state.messagesByChat,
              [chatId]: activeMsgs.map((m) =>
                m.id === msgId ? { ...m, status, readReceipt: status } : m
              ),
            },
          };
        });
      }
    } catch (err) {
      console.error('[realtime] handleRealtimeStatus error:', err);
    }
  },

  resetUnreadCount: async (chatId: string) => {
    try {
      const chat = get().chats.find((c) => c.id === chatId);
      // Skip redundant DB writes and state updates if unreadCount is already 0
      if (!chat || chat.unreadCount === 0) return;

      await db.update(chatsTable)
        .set({ unreadCount: 0 })
        .where(eq(chatsTable.id, chatId));

      set((state) => {
        const nextChats = state.chats.map((c) => {
          if (c.id === chatId) {
            return { ...c, unreadCount: 0 };
          }
          return c;
        });
        return { chats: nextChats };
      });
    } catch (e) {
      console.error('[unread] resetUnreadCount failed:', e);
    }
  },

  fetchAndCacheFilterOptions: async () => {
    try {
      // 1. Social Accounts
      try {
        const accRes = await API.get('/social-accounts');
        const accs = Array.isArray(accRes.data?.data) ? accRes.data.data
          : Array.isArray(accRes.data) ? accRes.data
            : [];
        storage.set('cached_social_accounts', JSON.stringify(accs));
      } catch (e) {
        console.warn('Sync social accounts failed:', e);
      }

      // 2. Departments
      try {
        const depRes = await API.get('/department/all');
        const deps = depRes.data?.departments || [];
        storage.set('cached_departments', JSON.stringify(deps));
      } catch (e) {
        console.warn('Sync departments failed:', e);
      }

      // 3. Keywords
      try {
        const kwRes = await API.get('/keywords', { params: { page: 1, limit: 500 } });
        const kws = kwRes.data?.data?.keywords || kwRes.data?.data?.list || [];
        storage.set('cached_keywords', JSON.stringify(kws));
      } catch (e) {
        console.warn('Sync keywords failed:', e);
      }

      // 4. Campaigns
      try {
        const campRes = await API.get('/chats/campaigns');
        const camps = campRes.data?.campaigns || [];
        storage.set('cached_campaigns', JSON.stringify(camps));
      } catch (e) {
        console.warn('Sync campaigns failed:', e);
      }

      // 5. Templates for all unique phone number IDs
      const chats = get().chats;
      const cachedAccsStr = storage.getString('cached_social_accounts');
      const cachedAccs = cachedAccsStr ? JSON.parse(cachedAccsStr) : [];

      const phoneIdsSet = new Set<string>();
      chats.forEach(c => { if (c.accountId) phoneIdsSet.add(c.accountId); });
      cachedAccs.forEach((acc: any) => {
        const pId = acc.phoneNumberId || acc.phone_number_id || acc.accountId || acc.account_id;
        if (pId) phoneIdsSet.add(pId);
      });

      const phoneIds = Array.from(phoneIdsSet);
      for (const phoneId of phoneIds) {
        try {
          const tempRes = await API.get('/template', { params: { limit: 1000, phone_number_id: phoneId } });
          const templates = tempRes.data?.templates?.data || tempRes.data?.data || (Array.isArray(tempRes.data) ? tempRes.data : []);
          storage.set(`templates_${phoneId}`, JSON.stringify(templates));
        } catch (e) {
          console.warn(`Sync templates from /template for ${phoneId} failed, trying /template/library:`, e);
          try {
            const tempRes = await API.get('/template/library', { params: { phone_number_id: phoneId } });
            const templates = tempRes.data?.templates?.data || [];
            storage.set(`templates_${phoneId}`, JSON.stringify(templates));
          } catch (libraryErr) {
            console.warn(`Sync templates from /template/library for ${phoneId} failed:`, libraryErr);
          }
        }
      }
    } catch (err) {
      console.error('[sync] fetchAndCacheFilterOptions error:', err);
    }
  },
}));
