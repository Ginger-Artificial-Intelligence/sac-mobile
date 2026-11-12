import { create } from 'zustand';
import { Alert } from 'react-native';
import { db, upsertChatBatch, upsertMessageBatch, upsertContactBatch } from '../db/client';
import { chats as chatsTable, messages as messagesTable, contacts as contactsTable } from '../db/schema';
import { eq, desc, and, lt, notLike } from 'drizzle-orm';
import { storage, mmkvKeys } from './mmkv';
import { getToken, setToken, clearToken } from './secureToken';
import { mediaPreviewLabel, uploadMediaToMeta, type PickedMedia } from '../lib/mediaUpload';
import {
  extractChats,
  extractMessages,
  extractContacts,
  getNextChatCursor,
  checkHasMoreChats,
  mapApiChat,
  mapApiMessage,
} from '../lib/chatMapping';
import API from '../config/axios';
import { playNotificationSound } from '../lib/audioNotification';

// Re-exported so existing imports from the store keep working
export { extractMessages, extractContacts, getNextChatCursor, checkHasMoreChats, mapApiChat, mapApiMessage };

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
  lastMsgReceivedAt: string | null;
  isGroup: boolean;
  waGroupId: string | null;
  replyTimeoutStatus: string | null;
  slaType: string | null;
  rawJson: string | null;
}

/** A non-text, non-file WhatsApp message: a location, or an interactive location/address request */
export interface SpecialMessage {
  type: 'location' | 'interactive';
  /** the `message` object sent to the server and shown in the optimistic bubble */
  message: Record<string, any>;
  /** shown in the chat list as the last message */
  label: string;
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

// Incremental refresh (foreground / socket reconnect / timer)
const REFRESH_MIN_INTERVAL_MS = 15_000;  // ignore triggers closer together than this
const REFRESH_MAX_CHATS = 20;            // fetch new messages for at most this many changed chats
const REFRESH_MAX_PAGES = 3;             // pages of 50 per chat

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
        lastMsgReceivedAt: chat.lastMsgReceivedAt,
        isGroup: chat.isGroup,
        waGroupId: chat.waGroupId,
        replyTimeoutStatus: chat.replyTimeoutStatus,
        slaType: chat.slaType,
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
  /** Remove a message that could not be sent (the "Delete" of the failed-send bar) */
  discardFailedMessage: (chatId: string, messageId: string) => Promise<void>;

  // local DB reads
  loadChats: () => Promise<void>;
  loadContacts: () => Promise<void>;
  loadMessages: (chatId: string) => Promise<number>;
  prefetchMessages: (chatId: string) => void;
  loadOlderMessages: (chatId: string, limit?: number) => Promise<number>;
  appendOlderMessages: (chatId: string, newMsgs: Message[]) => void;

  // chat list pagination
  lastChatCursor: string | null;
  hasMoreChats: boolean;
  isLoadingMoreChats: boolean;
  loadMoreChats: () => Promise<number>;

  // local writes (optimistic)
  addLocalMessage: (
    chatId: string,
    text: string,
    replyTo?: ReplyToContext | null,
    opts?: { directSend?: boolean; media?: PickedMedia; special?: SpecialMessage }
  ) => Promise<void>;
  addLocalContact: (contact: Omit<Contact, 'id'>) => Promise<void>;

  // selection & bulk actions
  setSelectedChatIds: (ids: Set<string>) => void;
  clearSelection: () => void;
  bulkSetStarred: (chatIds: string[], isStarred: boolean) => Promise<void>;
  bulkSetPinned: (chatIds: string[], pinned: boolean) => Promise<void>;

  // single-chat actions (optimistic, rolled back if the server refuses; return true on success)
  patchChat: (
    chatId: string,
    patch: Partial<Pick<Chat, 'name' | 'isOpen' | 'isBlocked' | 'assignedToName' | 'lastMsgReceivedAt' | 'leadStage' | 'pinned' | 'isStarred'>>
  ) => Promise<void>;
  toggleChatOpen: (chatId: string, isOpen: boolean) => Promise<boolean>;
  setChatBlocked: (chatId: string, isBlock: boolean) => Promise<boolean>;
  assignChat: (chatId: string, userIdsToAssign: string[], userIdsToRemove: string[], assigneeName: string | null) => Promise<boolean>;

  // backend sync (called after login and periodically)
  syncData: (apiChats: Chat[], apiContacts: Contact[]) => Promise<void>;
  syncWithBackend: () => Promise<void>;
  refreshRecent: (opts?: { force?: boolean }) => Promise<void>;
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

// Chat list order, matching the in-memory ordering: pinned first, then most recent
const CHAT_ORDER = [desc(chatsTable.pinned), desc(chatsTable.updatedAt)] as const;

// Chats we read locally but whose "mark as read" call to the server has not succeeded yet. The server
// keeps its own unread count, so without this a refresh/sync brings the old number back.
const pendingReadIds = new Set<string>();

function markChatReadOnServer(chat: Pick<Chat, 'id' | 'channel' | 'accountId'>): Promise<void> {
  const params: Record<string, string> = {};
  if (chat.channel) params.channel = chat.channel;
  if (chat.accountId) {
    params.accountId = chat.accountId;
    if (chat.channel === 'whatsapp') params.phone_number_id = chat.accountId;
  }
  return API.get(`/messages/change-status/${chat.id}`, { params })
    .then(() => {
      pendingReadIds.delete(chat.id);
    })
    .catch((e) => {
      const status = e?.response?.status;
      // A client error will never succeed on retry (bad id, no permission); network/5xx errors will
      if (status && status < 500 && status !== 408 && status !== 429) pendingReadIds.delete(chat.id);
      else pendingReadIds.add(chat.id);
    });
}

/** Pinned first, then most recent: the order the inbox shows */
function sortChats(chats: Chat[]): Chat[] {
  return [...chats].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

/**
 * Pin and star are FLIPS on the server (`chat.isPinned = !chat.isPinned`), shared by the whole
 * workspace. Sending a flip for a chat whose server state we mis-believed would undo the change, and
 * a silently failed request would be reverted by the next refresh. So: flip only if needed, read the
 * state the server reports, flip once more if it still differs, and return null if the call failed.
 */
async function setFlagOnServer(kind: 'pin' | 'star', chatId: string, desired: boolean, believed: boolean): Promise<boolean | null> {
  const path = kind === 'pin' ? `/chats/toggle-chat-pin/${chatId}` : `/chats/toggle-chat-star/${chatId}`;
  const field = kind === 'pin' ? 'isPinned' : 'isStarred';
  let state = believed;
  try {
    for (let i = 0; i < 2 && state !== desired; i++) {
      const res = await API.patch(path);
      const reported = res.data?.chat?.[field];
      state = typeof reported === 'boolean' ? reported : !state;
    }
    return state;
  } catch (e) {
    console.warn(`[chat] ${kind} failed for ${chatId}:`, e);
    return null;
  }
}

async function reconcileFlag(kind: 'pin' | 'star', ids: string[], desired: boolean, prior: Map<string, boolean>) {
  const key = kind === 'pin' ? 'pinned' : 'isStarred';
  const failed: string[] = [];
  await Promise.all(
    ids.map(async (id) => {
      const before = prior.get(id) ?? !desired;
      const result = await setFlagOnServer(kind, id, desired, before);
      if (result === null) {
        failed.push(id);
        await useSyncStore.getState().patchChat(id, { [key]: before });
      } else if (result !== desired) {
        await useSyncStore.getState().patchChat(id, { [key]: result });
      }
    })
  );
  if (failed.length > 0) {
    Alert.alert(
      kind === 'pin' ? 'Could not change pin' : 'Could not change star',
      `${failed.length === 1 ? 'The chat was' : `${failed.length} chats were`} left as before. You may not have permission, or you are offline.`
    );
  }
}

/** Server chats must not undo what the user already read here (open chat, or read-call still pending) */
function keepReadLocally(chats: Chat[], activeChatId: string | null): Chat[] {
  return chats.map((c) => (c.id === activeChatId || pendingReadIds.has(c.id) ? { ...c, unreadCount: 0 } : c));
}

const prefetchingMessageIds = new Set<string>();

let isLoggingOut = false;
let syncRunId = 0;
let isRefreshing = false;
let lastRefreshAt = 0;

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
  userToken: getToken(),
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
    const prior = new Map(get().chats.filter((c) => idSet.has(c.id)).map((c) => [c.id, c.isStarred] as const));
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

    // 3. Make the server match (it only flips the flag, so check its answer and correct)
    await reconcileFlag('star', chatIds, isStarred, prior);
  },

  bulkSetPinned: async (chatIds: string[], pinned: boolean) => {
    if (chatIds.length === 0) return;
    const idSet = new Set(chatIds);
    const prior = new Map(get().chats.filter((c) => idSet.has(c.id)).map((c) => [c.id, c.pinned] as const));
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

    // 3. Make the server match (it only flips the flag, so check its answer and correct)
    await reconcileFlag('pin', chatIds, pinned, prior);
  },

  patchChat: async (chatId, patch) => {
    set((state) => {
      const next = state.chats.map((c) => (c.id === chatId ? { ...c, ...patch } : c));
      return { chats: 'pinned' in patch ? sortChats(next) : next };
    });
    try {
      await db.update(chatsTable).set(patch).where(eq(chatsTable.id, chatId));
    } catch (e) {
      console.error('[chat] patchChat db error:', e);
    }
  },

  // Open/close is a "set", not a toggle: PATCH /chats/toggle-chat-status/:id { isOpen }
  toggleChatOpen: async (chatId, isOpen) => {
    const chat = get().chats.find((c) => c.id === chatId);
    if (!chat) return false;
    const previous = chat.isOpen;
    await get().patchChat(chatId, { isOpen });
    try {
      await API.patch(`/chats/toggle-chat-status/${chatId}`, {
        isOpen,
        ...(chat.channel === 'whatsapp' && chat.accountId ? { phone_number_id: chat.accountId } : {}),
      });
      return true;
    } catch (e) {
      console.warn('[chat] toggleChatOpen failed:', e);
      await get().patchChat(chatId, { isOpen: previous });
      return false;
    }
  },

  // PATCH /contacts/block-unblock/:id takes the CHAT id
  setChatBlocked: async (chatId, isBlock) => {
    const chat = get().chats.find((c) => c.id === chatId);
    if (!chat) return false;
    const previous = chat.isBlocked;
    await get().patchChat(chatId, { isBlocked: isBlock });
    try {
      await API.patch(`/contacts/block-unblock/${chatId}`, {
        isBlock,
        ...(chat.channel === 'whatsapp' && chat.accountId ? { phone_number_id: chat.accountId } : {}),
      });
      return true;
    } catch (e) {
      console.warn('[chat] setChatBlocked failed:', e);
      await get().patchChat(chatId, { isBlocked: previous });
      return false;
    }
  },

  // POST /chats/assign: both arrays are required (empty arrays clear nothing, they just add/remove nobody)
  assignChat: async (chatId, userIdsToAssign, userIdsToRemove, assigneeName) => {
    const chat = get().chats.find((c) => c.id === chatId);
    if (!chat) return false;
    try {
      await API.post('/chats/assign', { chatId, userIdsToAssign, userIdsToRemove });
      await get().patchChat(chatId, { assignedToName: assigneeName });
      return true;
    } catch (e) {
      console.warn('[chat] assignChat failed:', e);
      return false;
    }
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

  discardFailedMessage: async (chatId: string, messageId: string) => {
    set((state) => {
      const msgs = state.messagesByChat[chatId];
      if (!msgs) return state;
      return { messagesByChat: { ...state.messagesByChat, [chatId]: msgs.filter((m) => m.id !== messageId) } };
    });
    try {
      await db.delete(messagesTable).where(eq(messagesTable.id, messageId));
    } catch (err) {
      console.error('Failed to discard message:', err);
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
    setToken(token);
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
    // Parallel 401s all call logout(); only let the first one run.
    if (isLoggingOut) return;
    isLoggingOut = true;
    syncRunId++; // cancel any sync still running for this session
    try {
      const token = get().userToken || getToken();
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
      clearToken();
      storage.remove(mmkvKeys.TENANT_ID);
      storage.remove(mmkvKeys.USER_ID);
      storage.remove(mmkvKeys.USER_NAME);
      storage.remove(mmkvKeys.USER_ROLE);

      // Drop tenant-scoped caches (filters, departments, templates, ...)
      try {
        for (const key of storage.getAllKeys()) {
          if (key.startsWith('cached_') || key.startsWith('templates_')) storage.remove(key);
        }
      } catch (cacheErr) {
        console.error('Failed to purge cached MMKV keys:', cacheErr);
      }

      // Purge local database contents on logout
      try {
        const { expoDb } = require('../db/client');
        await expoDb.execAsync('DELETE FROM chats;');
        await expoDb.execAsync('DELETE FROM contacts;');
        await expoDb.execAsync('DELETE FROM messages;');
        await expoDb.execAsync('DELETE FROM media_cache;');
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
        isSyncing: false,
        isInitialSync: false,
      });
    } finally {
      isLoggingOut = false;
    }
  },

  // ── Local DB reads ─────────────────────────────────────────────────────────

  loadChats: async () => {
    try {
      const result = await db.select().from(chatsTable).orderBy(...CHAT_ORDER).limit(100);
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
      // Same order as loadChats (pinned first, then newest) so offset == number already loaded.
      // Realtime inserts can shift rows, so skip ones already in memory and keep paging.
      const loadedIds = new Set(state.chats.map((c) => c.id));
      let offset = state.chats.length;
      for (;;) {
        const localResults = await db
          .select()
          .from(chatsTable)
          .orderBy(...CHAT_ORDER)
          .limit(50)
          .offset(offset);

        if (localResults.length === 0) break;

        const localChats = (localResults as Chat[]).filter((c) => !loadedIds.has(c.id));
        if (localChats.length > 0) {
          set((s) => ({
            chats: [...s.chats, ...localChats.filter((c) => !s.chats.some((x) => x.id === c.id))],
            isLoadingMoreChats: false,
          }));
          return localChats.length;
        }
        offset += localResults.length;
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
          const mappedChats = keepReadLocally(rawChats.map(mapApiChat), get().activeChatId);
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

      const mappedChats = keepReadLocally(rawChats.map(mapApiChat), get().activeChatId);
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

  // Warm the in-memory message list for a chat (called on touch-down on a chat row), so the chat
  // screen already has its messages in the first frame
  prefetchMessages: (chatId: string) => {
    if (get().messagesByChat[chatId]?.length || prefetchingMessageIds.has(chatId)) return;
    prefetchingMessageIds.add(chatId);
    get()
      .loadMessages(chatId)
      .finally(() => prefetchingMessageIds.delete(chatId));
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

  addLocalMessage: async (chatId: string, text: string, replyTo?: ReplyToContext | null, opts?: { directSend?: boolean; media?: PickedMedia; special?: SpecialMessage }) => {
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

    // Media messages show at once with the local file, upload in the background, then send
    const media = opts?.media;
    const special = opts?.special;
    const msgType = media ? media.kind : special ? special.type : 'text';
    const previewText = media ? text || mediaPreviewLabel(media) : special ? special.label : text;

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
      message_type: msgType,
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
        type: msgType,
        text,
        ...(special ? special.message : {}),
        ...(media
          ? {
              [msgType]: {
                url: media.uri,
                caption: text,
                ...(media.kind === 'document' ? { filename: media.name } : {}),
                ...(media.isVoice ? { isVoice: true, voice: true } : {}),
              },
            }
          : {}),
      },
    };

    const newMessage: Message = {
      id: messageId,
      chatId,
      text,
      sender: 'You',
      isOutgoing: true,
      type: msgType,
      mediaUrl: media?.uri ?? null,
      status: 'pending',
      timestamp,
      readReceipt: null,
      isImage: msgType === 'image',
      rawJson: JSON.stringify(rawJsonObj),
    };

    set((state) => {
      const chatMsgs = state.messagesByChat[chatId] || [];
      let updatedChat: Chat | undefined;
      const otherChats: Chat[] = [];

      for (const c of state.chats) {
        if (c.id === chatId) {
          updatedChat = { ...c, lastMessage: previewText, updatedAt: timestamp };
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
      await db.update(chatsTable).set({ lastMessage: previewText, updatedAt: timestamp }).where(eq(chatsTable.id, chatId));
    } catch (err) {
      console.error('Failed to persist message locally:', err);
      get().loadChats();
      get().loadMessages(chatId);
      return;
    }

    // Upload the file first (WhatsApp/Messenger/Instagram all send by asset id)
    let assetId = '';
    if (media) {
      try {
        assetId = await uploadMediaToMeta(media, { channel: chat?.channel ?? null, accountId: chat?.accountId ?? null });
        // The confirmed message shows the local file instead of downloading what we just uploaded
        require('../hooks/useMessageMedia').seedLocalMedia(assetId, chatId, chat?.accountId, media.uri);
      } catch (e: any) {
        console.warn('[media] upload failed:', e);
        await get().updateMessageStatus(chatId, messageId, 'failed');
        Alert.alert(
          'Upload failed',
          e?.response?.status === 403
            ? "You don't have permission to upload files."
            : e?.response?.data?.message || e?.message || 'The file could not be uploaded.'
        );
        return;
      }
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
        type: msgType,
        ...(media ? { assetId, uploadAssetId: assetId, text } : {}),
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
        // Direct Send: a utility-category text, allowed outside the 24-hour window
        ...(opts?.directSend ? { isDirectSend: true, directSend: true, category: 'utility' } : {}),
        ...(effectiveReplyTo ? { reply_to: effectiveReplyTo } : {}),
        message: {
          replyMsgId: effectiveReplyMsgId,
          ...(special ? special.message : {}),
          ...(media
            ? {
                text,
                [msgType]: {
                  id: assetId,
                  uploaded_id: assetId,
                  uploadAssetId: assetId,
                  attachment_id: assetId,
                  ...(media.kind === 'document' ? { filename: media.name } : {}),
                  caption: text,
                  ...(media.isVoice ? { isVoice: true, voice: true } : {}),
                },
              }
            : special
              ? {}
              : { text: { body: text } }),
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

    // logout() bumps syncRunId, which makes this run stop at its next checkpoint
    const runId = ++syncRunId;
    const cancelled = () => runId !== syncRunId;

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
        if (cancelled()) return;

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
          const chat = keepReadLocally([mapApiChat(raw)], get().activeChatId)[0];
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
        if (cancelled()) return;

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

      if (!cancelled()) {
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
      if (!cancelled()) {
        set({ isSyncing: false, isInitialSync: false, syncProgress: null });
      }
    }
  },

  // ── Incremental refresh: catch up on anything missed while offline/backgrounded ──

  refreshRecent: async (opts) => {
    const { isAuthenticated, userToken, isSyncing, isInitialSync } = get();
    if (!isAuthenticated || !userToken || isSyncing || isInitialSync || isRefreshing) return;
    if (!opts?.force && Date.now() - lastRefreshAt < REFRESH_MIN_INTERVAL_MS) return;
    isRefreshing = true;
    lastRefreshAt = Date.now();

    try {
      // Retry "mark as read" calls that failed earlier, before asking the server for its counts
      for (const id of [...pendingReadIds]) {
        const pending = get().chats.find((c) => c.id === id);
        if (pending) await markChatReadOnServer(pending);
        else pendingReadIds.delete(id);
      }

      const res = await API.get('/chats/v2/all', { params: { limit: CHAT_PAGE_SIZE } });
      const serverChats = keepReadLocally(extractChats(res.data).map(mapApiChat), get().activeChatId);
      if (serverChats.length === 0) return;

      const localRows = await db.select({ id: chatsTable.id, updatedAt: chatsTable.updatedAt }).from(chatsTable);
      const localUpdated = new Map(localRows.map((r) => [r.id, r.updatedAt]));
      const changed = serverChats.filter((c) => {
        const local = localUpdated.get(c.id);
        return !local || new Date(c.updatedAt).getTime() > new Date(local).getTime();
      });

      await upsertChatBatch(serverChats);

      for (const chat of changed.slice(0, REFRESH_MAX_CHATS)) {
        try {
          // Newest message we already hold that came from the server (skip optimistic temp_ rows)
          const [newest] = await db
            .select({ id: messagesTable.id, timestamp: messagesTable.timestamp })
            .from(messagesTable)
            .where(and(eq(messagesTable.chatId, chat.id), notLike(messagesTable.id, 'temp_%')))
            .orderBy(desc(messagesTable.timestamp))
            .limit(1);

          const fetched: Message[] = [];
          if (!newest) {
            // Nothing local yet: same bootstrap as the initial sync
            const r = await API.get(`/messages/${chat.id}/sync`, { params: { direction: 'older', limit: 50 } });
            fetched.push(...extractMessages(r.data).map((m) => mapApiMessage(m, chat.id)));
          } else {
            let cursorId = newest.id;
            let cursorCreatedAt = newest.timestamp;
            for (let page = 0; page < REFRESH_MAX_PAGES; page++) {
              const r = await API.get(`/messages/${chat.id}/sync`, {
                params: { direction: 'newer', limit: 50, cursorId, cursorCreatedAt },
              });
              const batch = extractMessages(r.data).map((m) => mapApiMessage(m, chat.id));
              fetched.push(...batch);
              const end = r.data?.pageInfo?.endCursor;
              if (!r.data?.pageInfo?.hasMore || !end?.id) break;
              cursorId = String(end.id);
              cursorCreatedAt = String(end.createdAt);
            }
          }

          if (fetched.length === 0) continue;
          await upsertMessageBatch(fetched);

          // Merge into memory only for chats already loaded (keeps older pages the user scrolled)
          set((state) => {
            const current = state.messagesByChat[chat.id];
            if (!current) return state;
            const byId = new Map(current.map((m) => [m.id, m]));
            for (const m of fetched) byId.set(m.id, m);
            const merged = [...byId.values()].sort(
              (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            );
            return { messagesByChat: { ...state.messagesByChat, [chat.id]: merged } };
          });
        } catch (e) {
          console.warn(`[refresh] messages for ${chat.id} failed (non-fatal):`, e);
        }
      }

      await get().loadChats();
    } catch (err) {
      console.warn('[refresh] refreshRecent failed:', err);
    } finally {
      isRefreshing = false;
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

      // A message arriving in the chat being looked at is read on arrival: tell the server so its
      // unread count does not creep up behind our back
      if (isActiveChat && !msg.isOutgoing) {
        const openChat = get().chats.find((c) => c.id === chatId);
        markChatReadOnServer(openChat ?? { id: chatId, channel: incoming.channel ?? null, accountId: null });
      }

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
          lastMsgReceivedAt: null,
          isGroup: false,
          waGroupId: null,
          replyTimeoutStatus: null,
          slaType: null,
          rawJson: null,
        };
      }

      // A customer message reopens the WhatsApp 24-hour window straight away (the server's
      // `lastMessageTime` event confirms it later)
      if (!msg.isOutgoing) {
        targetChat = {
          ...targetChat,
          lastMsgReceivedAt: String(Math.floor(new Date(msg.timestamp).getTime() / 1000)),
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
      if (!chat) return;

      // Tell the server as well, otherwise its count survives and returns on the next refresh/sync
      if (chat.unreadCount > 0 || pendingReadIds.has(chatId)) {
        markChatReadOnServer(chat);
      }

      // Skip redundant DB writes and state updates if unreadCount is already 0
      if (chat.unreadCount === 0) return;

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
