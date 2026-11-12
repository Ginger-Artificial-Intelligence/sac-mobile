import { useEffect } from 'react';
import API from '../config/axios';
import { useSyncStore } from '../store/syncStore';

const isHttp = (v?: string | null) => !!v && /^https?:\/\//.test(v);
const isSocial = (channel?: string | null) => channel === 'instagram' || channel === 'messenger';

// One request per chat (and per expired URL) per app session. The backend serves the profile it
// has saved and rate-limits refreshes, so this never hammers Meta.
const requested = new Set<string>();

async function syncSocialProfile(chatId: string, refresh: boolean) {
  const res = await API.get(`/chats/${chatId}/social-profile`, { params: refresh ? { refresh: true } : undefined });
  const saved = res.data?.chat;
  if (!saved) return;
  const pic: string | undefined = saved.socialProfile?.profilePic;
  const handle: string | undefined = saved.socialProfile?.username;
  useSyncStore.setState((state) => ({
    chats: state.chats.map((c) =>
      c.id === chatId
        ? { ...c, name: saved.name || c.name, username: handle || c.username, ...(pic ? { avatar: pic } : {}) }
        : c
    ),
  }));
}

// Meta picture URLs expire after a few days: when a saved one fails to load, ask for a fresh one.
export function refreshExpiredAvatar(chatId: string, url?: string | null) {
  const key = `${chatId}|${url ?? ''}`;
  if (requested.has(key)) return;
  requested.add(key);
  syncSocialProfile(chatId, true).catch(() => {});
}

// Fetches the profile only when none is saved on the chat yet (no picture URL).
export function useSocialProfile(chatId: string | undefined, channel: string, avatar?: string | null) {
  useEffect(() => {
    if (!chatId || !isSocial(channel) || isHttp(avatar)) return;
    const key = `${chatId}|missing`;
    if (requested.has(key)) return;
    requested.add(key);
    syncSocialProfile(chatId, false).catch(() => {});
  }, [chatId, channel, avatar]);
}
