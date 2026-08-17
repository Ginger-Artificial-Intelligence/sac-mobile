import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';
import * as schema from './schema';
import { globalMediaQueue } from '../lib/mediaQueue';

export const expoDb = openDatabaseSync('proton.db');

export const db = drizzle(expoDb, { schema });

/**
 * Initializes the SQLite database by creating tables if they don't exist.
 * Uses ALTER TABLE to safely add new columns on existing installs.
 */
export async function initializeDatabase() {
  try {
    await expoDb.execAsync('PRAGMA foreign_keys = ON;');

    // ── Chats ────────────────────────────────────────────────────────────────
    await expoDb.execAsync(`
      CREATE TABLE IF NOT EXISTS chats (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        phone_number TEXT,
        channel TEXT,
        last_message TEXT,
        unread_count INTEGER DEFAULT 0 NOT NULL,
        avatar TEXT,
        pinned INTEGER DEFAULT 0 NOT NULL,
        is_starred INTEGER DEFAULT 0 NOT NULL,
        is_open INTEGER DEFAULT 0 NOT NULL,
        assigned_to_name TEXT,
        lead_stage TEXT,
        social_account_id TEXT,
        updated_at TEXT NOT NULL,
        accountId TEXT,
        username TEXT,
        is_blocked INTEGER DEFAULT 0 NOT NULL,
        is_campaign_chat INTEGER DEFAULT 0 NOT NULL
      );
    `);

    // Safely add new columns to existing chats installs
    const chatCols = [
      { name: 'phone_number', type: 'TEXT' },
      { name: 'channel', type: 'TEXT' },
      { name: 'is_starred', type: 'INTEGER DEFAULT 0 NOT NULL' },
      { name: 'is_open', type: 'INTEGER DEFAULT 0 NOT NULL' },
      { name: 'assigned_to_name', type: 'TEXT' },
      { name: 'lead_stage', type: 'TEXT' },
      { name: 'social_account_id', type: 'TEXT' },
      { name: 'accountId', type: 'TEXT' },
      { name: 'username', type: 'TEXT' },
      { name: 'is_blocked', type: 'INTEGER DEFAULT 0 NOT NULL' },
      { name: 'is_campaign_chat', type: 'INTEGER DEFAULT 0 NOT NULL' }
    ];
    for (const col of chatCols) {
      try {
        await expoDb.execAsync(`ALTER TABLE chats ADD COLUMN ${col.name} ${col.type};`);
      } catch (_) { /* column already exists */ }
    }

    // ── Messages ─────────────────────────────────────────────────────────────
    await expoDb.execAsync(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY NOT NULL,
        chat_id TEXT NOT NULL,
        text TEXT NOT NULL,
        sender TEXT,
        is_outgoing INTEGER DEFAULT 0 NOT NULL,
        type TEXT DEFAULT 'text' NOT NULL,
        media_url TEXT,
        status TEXT DEFAULT 'sent' NOT NULL,
        timestamp TEXT NOT NULL,
        read_receipt TEXT,
        is_image INTEGER DEFAULT 0 NOT NULL,
        raw_json TEXT,
        FOREIGN KEY (chat_id) REFERENCES chats (id) ON DELETE CASCADE
      );
    `);

    // Safely add new columns to existing messages installs
    const msgCols: [string, string][] = [
      ['is_outgoing', 'INTEGER DEFAULT 0 NOT NULL'],
      ['type', "TEXT DEFAULT 'text' NOT NULL"],
      ['media_url', 'TEXT'],
      ['status', "TEXT DEFAULT 'sent' NOT NULL"],
      ['raw_json', 'TEXT'],
    ];
    for (const [col, def] of msgCols) {
      try {
        await expoDb.execAsync(`ALTER TABLE messages ADD COLUMN ${col} ${def};`);
      } catch (_) { /* column already exists */ }
    }

    // ── Contacts ─────────────────────────────────────────────────────────────
    await expoDb.execAsync(`
      CREATE TABLE IF NOT EXISTS contacts (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        username TEXT,
        phone TEXT,
        channel TEXT,
        status TEXT,
        sub_status TEXT,
        last_activity TEXT
      );
    `);

    // Clean up legacy mock records from previous sessions
    await expoDb.execAsync(`
      DELETE FROM chats WHERE id IN ('1', '2', '3', '4', '5', '6');
      DELETE FROM contacts WHERE id IN ('1', '2', '3', '4', '5', '6');
      DELETE FROM messages WHERE id IN ('m1', 'm2') OR chat_id IN ('1', '2', '3', '4', '5', '6');
    `);

    // ── Media Cache ──────────────────────────────────────────────────────────
    await expoDb.execAsync(`
      CREATE TABLE IF NOT EXISTS media_cache (
        key TEXT PRIMARY KEY NOT NULL,
        data_url TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);

    // Prune cache records older than 15 days
    const fifteenDaysAgo = Date.now() - 15 * 24 * 60 * 60 * 1000;
    await expoDb.execAsync(`DELETE FROM media_cache WHERE created_at < ${fifteenDaysAgo};`);

    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Failed to initialize database:', err);
  }
}

export async function getMediaCache(key: string): Promise<string | null> {
  try {
    const rows = await expoDb.getAllAsync<{ data_url: string }>('SELECT data_url FROM media_cache WHERE key = ?;', [key]);
    return rows.length > 0 ? rows[0].data_url : null;
  } catch (_) {
    return null;
  }
}

export async function setMediaCache(key: string, dataUrl: string): Promise<void> {
  try {
    await expoDb.runAsync('INSERT OR REPLACE INTO media_cache (key, data_url, created_at) VALUES (?, ?, ?);', [key, dataUrl, Date.now()]);
  } catch (_) { }
}

export async function prefetchChatMedia(chatId: string) {
  try {
    const messages = await expoDb.getAllAsync<{ id: string, media_url: string, raw_json: string, type: string }>(
      `SELECT id, coalesce(media_url, '') as media_url, raw_json, type 
       FROM messages 
       WHERE chat_id = ? AND type IN ('image', 'video', 'audio', 'document', 'sticker');`,
      [chatId]
    );

    const API = (await import('../config/axios')).default;
    for (const msg of messages) {
      let mediaId = '';
      try {
        const raw = JSON.parse(msg.raw_json || '{}');
        const media = raw?.message?.[msg.type] || raw?.[msg.type] || raw?.message_input?.[msg.type] || raw?.payload?.[msg.type] || raw?.message_input?.payload?.[msg.type] || {};
        mediaId = raw?.mediaId || raw?.media_id || media?.id || media?.mediaId || media?.media_id || media?.uploaded_id || '';
      } catch (_) { }

      if (!mediaId) continue;

      const cacheKey = `${mediaId}:${chatId}`;
      const cached = await getMediaCache(cacheKey);
      if (cached) continue;

      const params = getMediaParams(msg, chatId);
      // Fetch in background and save to SQLite
      globalMediaQueue.enqueue<string>(() => {
        return API.get(`/chats/media/${mediaId}`, {
          responseType: "blob",
          params
        }).then((res: any) => {
          return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error("Blob read fail"));
            reader.onloadend = () => {
              let dataUrl = reader.result as string;
              if (dataUrl.startsWith("data:application/octet-stream;")) {
                if (msg.type === "image") {
                  dataUrl = dataUrl.replace("data:application/octet-stream;", "data:image/jpeg;");
                } else if (msg.type === "video") {
                  dataUrl = dataUrl.replace("data:application/octet-stream;", "data:video/mp4;");
                } else if (msg.type === "audio") {
                  dataUrl = dataUrl.replace("data:application/octet-stream;", "data:audio/mpeg;");
                }
              }
              resolve(dataUrl);
            };
            reader.readAsDataURL(res.data);
          });
        });
      }).then(async (dataUrl) => {
        await setMediaCache(cacheKey, dataUrl);
      }).catch(() => {
        // Silently fail so user can download on demand later
      });
    }
  } catch (err) {
    console.warn('[prefetch] prefetchChatMedia failed:', err);
  }
}

function uint8ToBase64(uint8: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  const len = uint8.length;
  for (let i = 0; i < len; i += 3) {
    const b1 = uint8[i];
    const b2 = i + 1 < len ? uint8[i + 1] : 0;
    const b3 = i + 2 < len ? uint8[i + 2] : 0;
    const c1 = b1 >> 2;
    const c2 = ((b1 & 3) << 4) | (b2 >> 4);
    const c3 = i + 1 < len ? (((b2 & 15) << 2) | (b3 >> 6)) : 64;
    const c4 = i + 2 < len ? (b3 & 63) : 64;
    result += chars[c1] + chars[c2] + (c3 === 64 ? '=' : chars[c3]) + (c4 === 64 ? '=' : chars[c4]);
  }
  return result;
}

export function getMediaParams(message: any, chatId?: string, phoneNumberId?: string): Record<string, string> {
  console.log({ chatId, phoneNumberId })
  let raw: any = {};
  const jsonStr = message?.rawJson || message?.raw_json || '';
  if (jsonStr) {
    try {
      raw = JSON.parse(jsonStr);
    } catch (_) { }
  }

  const entity = { ...message, ...raw };
  if (chatId) entity.chatId = chatId;
  if (phoneNumberId) {
    entity.phoneNumberId = phoneNumberId;
    if (!entity.accountId) entity.accountId = phoneNumberId;
  }

  const clean = (val: any): string => {
    if (val === undefined || val === null) return '';
    const str = String(val).trim();
    if (str === '' || str === 'undefined' || str === 'null' || str === 'NaN') return '';
    return str;
  };

  // getEntityPhoneNumberId fallbacks
  let phoneId = clean(entity.phone_number_id) ||
    clean(entity.phoneNumberId) ||
    clean(entity.waPhoneNumberId) ||
    clean(entity.rawData?.phone_number_id) ||
    clean(entity.rawData?.phoneNumberId) ||
    clean(entity.socialAccount?.phone_number_id) ||
    clean(entity.socialAccount?.phoneNumberId) ||
    clean(entity.sourceAccount?.phone_number_id) ||
    clean(entity.sourceAccount?.phoneNumberId) ||
    clean(entity.metadata?.phone_number_id) ||
    clean(entity.accountId) ||
    clean(entity.metadata?.phoneNumberId);

  // getEntityAccountId fallbacks
  let accId = clean(entity.accountId) ||
    clean(entity.account_id) ||
    clean(entity.socialAccountId) ||
    clean(entity.social_account_id) ||
    clean(entity.rawData?.accountId) ||
    clean(entity.rawData?.account_id) ||
    clean(entity.rawData?.socialAccountId) ||
    clean(entity.rawData?.social_account_id) ||
    clean(entity.socialAccount?.accountId) ||
    clean(entity.socialAccount?.account_id) ||
    clean(entity.sourceAccount?.accountId) ||
    clean(entity.sourceAccount?.account_id) ||
    clean(entity.metadata?.accountId) ||
    clean(entity.metadata?.account_id);

  const resolvedChatId = entity.chatId || entity.chat_id || entity.chat?._id || entity.chat?.id;

  try {
    // 1. Fallback using active chat row
    if ((!phoneId || !accId) && resolvedChatId) {
      const rows = expoDb.getAllSync<{ accountId: string; social_account_id: string }>(
        'SELECT accountId, social_account_id FROM chats WHERE id = ?;',
        [String(resolvedChatId)]
      );
      if (rows.length > 0) {
        const dbVal = clean(rows[0].accountId) || clean(rows[0].social_account_id);
        if (dbVal) {
          if (!phoneId) phoneId = dbVal;
          if (!accId) accId = dbVal;
        }
      }
    }

    // 2. Global fallback using any synced chat
    if (!phoneId || !accId) {
      const fallbackRows = expoDb.getAllSync<{ accountId: string; social_account_id: string }>(
        'SELECT accountId, social_account_id FROM chats WHERE (accountId IS NOT NULL AND accountId != "") OR (social_account_id IS NOT NULL AND social_account_id != "") LIMIT 1;'
      );
      if (fallbackRows.length > 0) {
        const dbVal = clean(fallbackRows[0].accountId) || clean(fallbackRows[0].social_account_id);
        if (dbVal) {
          if (!phoneId) phoneId = dbVal;
          if (!accId) accId = dbVal;
        }
      }
    }
  } catch (err) {
    console.warn('[client.ts] Direct SQLite query failed:', err);
  }

  // 3. Ultimate Fallback using authenticated Tenant ID from MMKV or Zustand store state
  if (!phoneId || !accId) {
    try {
      const { storage, mmkvKeys } = require('../store/mmkv');
      const mmkvTenantId = storage.getString(mmkvKeys.TENANT_ID);
      const dbVal = clean(mmkvTenantId);
      if (dbVal) {
        if (!phoneId) phoneId = dbVal;
        if (!accId) accId = dbVal;
      }
    } catch (_) { }
  }
  if (!phoneId || !accId) {
    try {
      const { useSyncStore } = require('../store/syncStore');
      const storeTenantId = useSyncStore.getState().tenantId;
      const dbVal = clean(storeTenantId);
      if (dbVal) {
        if (!phoneId) phoneId = dbVal;
        if (!accId) accId = dbVal;
      }
    } catch (_) { }
  }

  const params: Record<string, string> = {};
  const finalPhoneId = phoneId || accId;
  const finalAccId = accId || phoneId;

  if (finalPhoneId) params.phone_number_id = finalPhoneId;
  if (finalAccId) params.accountId = finalAccId;

  return params;
}
