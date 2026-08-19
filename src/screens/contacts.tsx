import { View, TextInput, Pressable, ScrollView } from "react-native";
import { Text } from "../components/ui/Text";
import { Icon } from "../components/ui/Icon";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { LoadingSpinner } from "../components/ui/Loading";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSyncStore, Contact } from "../store/syncStore";
import { useEffect, useState, useCallback, useMemo } from "react";
import { FlashList } from "@shopify/flash-list";
import API from "../config/axios";
import { db } from "../db/client";
import { contacts as contactsTable } from "../db/schema";
import { like, or } from "drizzle-orm";
import { useThemeStore } from "../store/themeStore";

// ─── Channel filter pills ─────────────────────────────────────────────────────
const CHANNEL_FILTERS = ["All", "whatsapp", "messenger", "instagram"] as const;
type ChannelFilter = typeof CHANNEL_FILTERS[number];

function extractContacts(response: any): any[] {
  if (Array.isArray(response?.contacts)) return response.contacts;
  if (Array.isArray(response?.data?.contacts)) return response.data.contacts;
  if (Array.isArray(response?.data?.data)) return response.data.data;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response)) return response;
  return [];
}

export default function ContactsScreen() {
  const insets = useSafeAreaInsets();
  const contacts = useSyncStore((state) => state.contacts);
  const loadContacts = useSyncStore((state) => state.loadContacts);
  const syncWithBackend = useSyncStore((state) => state.syncWithBackend);
  const isSyncing = useSyncStore((state) => state.isSyncing);
  const isDark = useThemeStore((state) => state.isDark);
  const colors = useThemeStore((state) => state.colors);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("All");
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    loadContacts();
  }, []);

  // ── Local-first search: filter from SQLite directly ───────────────────────
  const filteredContacts = useMemo(() => {
    let list = [...contacts];

    if (channelFilter !== "All") {
      list = list.filter((c) => c.channel?.toLowerCase() === channelFilter);
    }

    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      list = list.filter((c) =>
        c.name?.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q) ||
        c.username?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [contacts, searchText, channelFilter]);

  // ── When search has no local results, call API ─────────────────────────────
  useEffect(() => {
    if (!searchText.trim() || filteredContacts.length > 0) return;

    const timer = setTimeout(async () => {
      try {
        const res = await API.get('/contacts', { params: { searchKey: searchText, limit: 50 } });
        const raw: any[] = extractContacts(res.data);

        for (const c of raw) {
          const contact: Contact = {
            id: String(c._id || c.id),
            name: c.name || c.phoneNumber || 'Contact',
            username: c.email || null,
            phone: c.phoneNumber || null,
            channel: c.channel || null,
            status: c.tags?.[0] || null,
            subStatus: null,
            lastActivity: c.updatedAt || c.createdAt || null,
          };
          await db.insert(contactsTable).values(contact).onConflictDoUpdate({
            target: contactsTable.id,
            set: { name: contact.name, username: contact.username, phone: contact.phone, channel: contact.channel, status: contact.status, lastActivity: contact.lastActivity },
          });
        }
        await loadContacts();
      } catch (e) {
        console.warn('[contacts search] API fallback failed:', e);
      }
    }, 400); // debounce

    return () => clearTimeout(timer);
  }, [searchText, filteredContacts.length]);

  // ── Pull-to-refresh (max 5s UI spinner, background sync continues) ───────
  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    setPage(1);
    setHasMore(true);
    let isMounted = true;
    const timer = setTimeout(() => {
      if (isMounted) setIsRefreshing(false);
    }, 5000);

    (async () => {
      try {
        await syncWithBackend();
      } catch (err) {
        console.warn("Background contacts sync error:", err);
      } finally {
        clearTimeout(timer);
        if (isMounted) setIsRefreshing(false);
      }
    })();

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [syncWithBackend]);

  // ── Infinite scroll (load more from API) ──────────────────────────────────
  const loadMore = useCallback(async () => {
    if (isFetchingMore || !hasMore || searchText.trim()) return;
    setIsFetchingMore(true);
    try {
      const nextPage = page + 1;
      const res = await API.get('/contacts', { params: { page: nextPage, limit: 50 } });
      const raw: any[] = extractContacts(res.data);

      if (raw.length === 0) { setHasMore(false); return; }

      for (const c of raw) {
        const contact: Contact = {
          id: String(c._id || c.id),
          name: c.name || c.phoneNumber || 'Contact',
          username: c.email || null,
          phone: c.phoneNumber || null,
          channel: c.channel || null,
          status: c.tags?.[0] || null,
          subStatus: null,
          lastActivity: c.updatedAt || c.createdAt || null,
        };
        await db.insert(contactsTable).values(contact).onConflictDoUpdate({
          target: contactsTable.id,
          set: { name: contact.name, username: contact.username, phone: contact.phone, channel: contact.channel, status: contact.status, lastActivity: contact.lastActivity },
        });
      }
      await loadContacts();
      setPage(nextPage);
    } catch (e) {
      console.warn('[contacts] load more failed:', e);
    } finally {
      setIsFetchingMore(false);
    }
  }, [isFetchingMore, hasMore, page, searchText]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      {/* Header (Outside FlashList to prevent unmounting focus loss) */}
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, backgroundColor: colors.surfaceContainerLowest, borderBottomWidth: 1, borderBottomColor: colors.divider, marginBottom: 4 }}>
        {/* Title row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <Text style={{ fontSize: 24, fontWeight: '700', color: colors.primary }}>Contacts</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable style={{ backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Icon name="add" size={16} color={colors.onPrimary} />
              <Text style={{ color: colors.onPrimary, fontWeight: '600', fontSize: 14 }}>Add</Text>
            </Pressable>
            <Pressable style={{ backgroundColor: colors.surfaceContainerLow, padding: 8, borderRadius: 10 }}>
              <Icon name="upload" size={18} color={colors.primary} />
            </Pressable>
          </View>
        </View>

        {/* Search */}
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceContainerLow, borderRadius: 12, paddingHorizontal: 12, height: 44, marginBottom: 10 }}>
          <Icon name="search" size={20} color={colors.outline} />
          <TextInput
            style={{ flex: 1, marginLeft: 8, fontSize: 15, color: colors.onSurface }}
            placeholder="Search by name, phone, email…"
            placeholderTextColor={colors.outline}
            value={searchText}
            onChangeText={setSearchText}
            clearButtonMode="while-editing"
          />
          {searchText.length > 0 && (
            <Pressable onPress={() => setSearchText("")}>
              <Icon name="cancel" size={18} color={colors.outline} />
            </Pressable>
          )}
        </View>

        {/* Channel filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {CHANNEL_FILTERS.map((ch) => {
            const active = channelFilter === ch;
            return (
              <Pressable
                key={ch}
                onPress={() => setChannelFilter(ch)}
                style={{
                  paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
                  backgroundColor: active ? colors.primary : colors.surfaceContainerLow,
                  borderWidth: active ? 0 : 1, borderColor: colors.divider,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: active ? colors.onPrimary : colors.primary, textTransform: 'capitalize' }}>
                  {ch === 'All' ? 'All Channels' : ch}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Count badge */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 6 }}>
          <Text style={{ fontSize: 13.5, color: colors.outline }}>
            {filteredContacts.length} contact{filteredContacts.length !== 1 ? 's' : ''}
          </Text>
          {searchText.trim().length > 0 && filteredContacts.length === 0 && (
            <LoadingSpinner size={14} />
          )}
        </View>
      </View>

      <FlashList
        data={filteredContacts}
        keyExtractor={(item) => item.id}
        onRefresh={onRefresh}
        refreshing={isRefreshing}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          isSyncing || searchText.trim().length > 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 60, gap: 14 }}>
              <LoadingSpinner size={36} iconName="sync" />
              <Text style={{ fontSize: 15, color: '#737782' }}>
                {searchText.trim() ? 'Searching…' : 'Loading contacts…'}
              </Text>
            </View>
          ) : (
            <View style={{ alignItems: 'center', paddingTop: 60, gap: 10 }}>
              <Icon name="people-outline" size={48} color="#d0d6f9" />
              <Text style={{ fontSize: 16, color: '#9aa0a6' }}>No contacts found</Text>
            </View>
          )
        }
        ListFooterComponent={
          isFetchingMore ? (
            <View style={{ alignItems: 'center', paddingVertical: 16 }}>
              <LoadingSpinner size={22} />
            </View>
          ) : null
        }
        contentContainerStyle={{ paddingBottom: 112 + Math.max(insets.bottom, 16) }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item: contact }) => (
          <View style={{ paddingHorizontal: 12, paddingBottom: 10 }}>
            <Card className="p-4">
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                {/* Left: avatar + info */}
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                  <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: isDark ? '#1e3048' : '#dde3f9', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                    <Text style={{ fontSize: 19, fontWeight: '700', color: colors.primary }}>
                      {contact.name?.charAt(0)?.toUpperCase() ?? '?'}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Text style={{ fontWeight: '700', fontSize: 16.5, color: colors.onSurface }}>{contact.name}</Text>
                      {contact.status && <Badge variant="secondary" label={contact.status} />}
                    </View>
                    <Text style={{ fontSize: 13.5, color: colors.outline, marginTop: 2 }}>
                      {contact.username || contact.phone || ''}
                    </Text>
                  </View>
                </View>

                {/* Quick actions */}
                <View style={{ flexDirection: 'row', gap: 2 }}>
                  <Pressable style={{ padding: 6, borderRadius: 8 }}>
                    <Icon name="chat" size={20} color={colors.outline} />
                  </Pressable>
                  <Pressable style={{ padding: 6, borderRadius: 8 }}>
                    <Icon name="edit" size={20} color={colors.outline} />
                  </Pressable>
                </View>
              </View>

              {/* Details row */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.divider }}>
                {contact.phone && (
                  <View style={{ width: '50%', paddingRight: 8, marginBottom: 6 }}>
                    <Text style={{ fontSize: 12, color: colors.outline, marginBottom: 2 }}>Phone</Text>
                    <Text style={{ fontSize: 14.5, color: colors.onSurface, fontWeight: '500' }}>{contact.phone}</Text>
                  </View>
                )}
                {contact.channel && (
                  <View style={{ width: '50%', marginBottom: 6 }}>
                    <Text style={{ fontSize: 12, color: colors.outline, marginBottom: 2 }}>Channel</Text>
                    <Text style={{ fontSize: 14.5, color: colors.onSurface, fontWeight: '500', textTransform: 'capitalize' }}>{contact.channel}</Text>
                  </View>
                )}
                {contact.lastActivity && (
                  <View style={{ width: '100%' }}>
                    <Text style={{ fontSize: 12, color: colors.outline, marginBottom: 2 }}>Last Activity</Text>
                    <Text style={{ fontSize: 13.5, color: colors.outline }}>
                      {new Date(contact.lastActivity).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}
                    </Text>
                  </View>
                )}
              </View>
            </Card>
          </View>
        )}
      />
    </View>
  );
}
