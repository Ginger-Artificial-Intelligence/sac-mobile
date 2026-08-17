import {
  ScrollView, View, TextInput, Pressable, RefreshControl,
  Alert, Animated, PanResponder, useAnimatedValue,
} from "react-native";
import { Text } from "../components/ui/Text";
import { Icon } from "../components/ui/Icon";
import { LoadingSpinner } from "../components/ui/Loading";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSyncStore, Chat } from "../store/syncStore";
import { FlashList } from "@shopify/flash-list";
import API from "../config/axios";
import { NativeDropdown } from "../components/ui/NativeDropdown";

// ─── Tab filter mapping (matches ChatFilterTab from v1) ───────────────────────
type FilterTab = "All" | "Unread" | "Open" | "Starred" | "Referral" | "Assigned";

const TAB_FILTERS: FilterTab[] = ["All", "Unread", "Open", "Starred", "Referral", "Assigned"];

// ─── Selected action bar when multi-select is active ─────────────────────────
function SelectionBar({
  count,
  onStar,
  onPin,
  onMute,
  onClear,
}: {
  count: number;
  onStar: () => void;
  onPin: () => void;
  onMute: () => void;
  onClear: () => void;
}) {
  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#00326b',
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 4,
    }}>
      <Pressable onPress={onClear} style={{ padding: 8 }}>
        <Icon name="close" size={22} color="#ffffff" />
      </Pressable>
      <Text style={{ flex: 1, color: '#ffffff', fontWeight: '600', fontSize: 16 }}>
        {count} selected
      </Text>
      <Pressable onPress={onStar} style={{ padding: 8 }}>
        <Icon name="star-outline" size={22} color="#ffffff" />
      </Pressable>
      <Pressable onPress={onPin} style={{ padding: 8 }}>
        <Icon name="push-pin" size={22} color="#ffffff" />
      </Pressable>
      <Pressable onPress={onMute} style={{ padding: 8 }}>
        <Icon name="notifications-off" size={22} color="#ffffff" />
      </Pressable>
    </View>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// ─── Individual chat row (selection & actions) ─────────────────────────
const ChatRow = ({
  chat,
  selected,
  selecting,
  onPress,
  onLongPress,
}: {
  chat: Chat;
  selected: boolean;
  selecting: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) => {
  const pressAnim = useRef(new Animated.Value(0)).current;

  const handlePressIn = () => {
    pressAnim.stopAnimation();
    Animated.sequence([
      Animated.timing(pressAnim, {
        toValue: 1,
        duration: 0,
        useNativeDriver: false,
      }),
      Animated.delay(0),
      Animated.timing(pressAnim, {
        toValue: 0,
        duration: 350,
        useNativeDriver: false,
      }),
    ]).start();
  };

  const handlePressOut = () => {
    // Let the sequence complete naturally
  };

  const formattedTime = chat.updatedAt
    ? new Date(chat.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  const animatedBg = selected
    ? '#e8eeff'
    : pressAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ['#ffffff', 'rgba(0, 50, 107, 0.08)'],
    });

  return (
    <AnimatedPressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={100}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 12,
          backgroundColor: animatedBg as any,
        },
      ]}
    >
      {/* Selection checkbox */}
      {selecting && (
        <View style={{
          width: 22, height: 22, borderRadius: 11, borderWidth: 2,
          borderColor: selected ? '#00326b' : '#9aa0a6',
          backgroundColor: selected ? '#00326b' : 'transparent',
          alignItems: 'center', justifyContent: 'center', marginRight: 10,
        }}>
          {selected && <Icon name="check" size={14} color="#fff" />}
        </View>
      )}

      {/* Avatar */}
      <View style={{
        width: 48, height: 48, borderRadius: 24, marginRight: 12,
        backgroundColor: '#dde3f9', alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={{ fontSize: 18, fontWeight: '700', color: '#00326b' }}>
          {chat.avatar ?? chat.name?.charAt(0)?.toUpperCase() ?? '?'}
        </Text>
      </View>

      {/* Content */}
      <View style={{ flex: 1, paddingRight: 4 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text numberOfLines={1} style={{ fontWeight: chat.unreadCount > 0 ? '700' : '500', fontSize: 15, flex: 1 }}>
              {chat.name}
            </Text>
          </View>
          <Text style={{ fontSize: 11, color: '#737782', marginLeft: 8 }}>{formattedTime}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {chat.channel && (
            <View style={{ backgroundColor: '#eef0fb', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, marginRight: 5 }}>
              <Text style={{ fontSize: 10, color: '#00326b', fontWeight: '600' }}>
                {chat.channel.toUpperCase()}
              </Text>
            </View>
          )}
          {chat.lastMessage && (
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, color: chat.unreadCount > 0 ? '#1a1a2e' : '#737782' }}>
              {chat.lastMessage}
            </Text>
          )}
        </View>
      </View>

      {/* Right indicators */}
      <View style={{ alignItems: 'flex-end', justifyContent: 'center', gap: 4 }}>
        {chat.unreadCount > 0 ? (
          <View style={{ minWidth: 20, height: 20, backgroundColor: '#00326b', borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>
              {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
            </Text>
          </View>
        ) : null}
      </View>
    </AnimatedPressable>
  );
};

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function InboxScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // ── Store ─────────────────────────────────────────────────────────────────
  const chats = useSyncStore((state) => state.chats);
  const loadChats = useSyncStore((state) => state.loadChats);
  const syncWithBackend = useSyncStore((state) => state.syncWithBackend);
  const isSyncing = useSyncStore((state) => state.isSyncing);
  const syncProgress = useSyncStore((state) => state.syncProgress);
  const selectedIds = useSyncStore((state) => state.selectedChatIds);
  const setSelectedIds = useSyncStore((state) => state.setSelectedChatIds);
  const clearSelection = useSyncStore((state) => state.clearSelection);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [activeFilter, setActiveFilter] = useState<FilterTab>("All");
  const [searchText, setSearchText] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const selecting = selectedIds.size > 0;

  // Dropdown states
  const [selectedChannel, setSelectedChannel] = useState<string>("All");
  const [selectedAccount, setSelectedAccount] = useState<string>("All");
  const [selectedDepartment, setSelectedDepartment] = useState<string>("All");
  const [selectedQuickAssist, setSelectedQuickAssist] = useState<string>("All");
  const [selectedLeadStatus, setSelectedLeadStatus] = useState<string>("All");
  const [selectedCampaign, setSelectedCampaign] = useState<string>("All");
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [fabExpanded, setFabExpanded] = useState(false);

  useEffect(() => {
    loadChats();
  }, []);

  const topFilters = [
    {
      label: "Channel",
      icon: "chat",
      selectedValue: selectedChannel,
      options: [
        { label: "All Channels", value: "All" },
        { label: "WhatsApp", value: "whatsapp" },
        { label: "Messenger", value: "messenger" },
        { label: "Instagram", value: "instagram" },
      ],
      onSelect: setSelectedChannel,
    },
    {
      label: "Account",
      icon: "account-circle",
      selectedValue: selectedAccount,
      options: [
        { label: "All Accounts", value: "All" },
        { label: "Account 1", value: "account_1" },
        { label: "Account 2", value: "account_2" },
      ],
      onSelect: setSelectedAccount,
    },
  ];

  const dropdownFilters = [
    {
      label: "Department",
      icon: "domain",
      selectedValue: selectedDepartment,
      options: [
        { label: "All Departments", value: "All" },
        { label: "Sales", value: "Sales" },
        { label: "Support", value: "Support" },
      ],
      onSelect: setSelectedDepartment,
    },
    {
      label: "Quick Assist",
      icon: "flash-on",
      selectedValue: selectedQuickAssist,
      options: [
        { label: "All Keywords", value: "All" },
        { label: "Pricing", value: "Pricing" },
        { label: "Setup", value: "Setup" },
      ],
      onSelect: setSelectedQuickAssist,
    },
    {
      label: "Lead Status",
      icon: "flag",
      selectedValue: selectedLeadStatus,
      options: [
        { label: "All Statuses", value: "All" },
        { label: "New", value: "New" },
        { label: "Contacted", value: "Contacted" },
        { label: "Qualified", value: "Qualified" },
        { label: "Won", value: "Won" },
        { label: "Lost", value: "Lost" },
      ],
      onSelect: setSelectedLeadStatus,
    },
    {
      label: "Campaigns",
      icon: "campaign",
      selectedValue: selectedCampaign,
      options: [
        { label: "All Campaigns", value: "All" },
        { label: "Promo", value: "Promo" },
        { label: "Retention", value: "Retention" },
      ],
      onSelect: setSelectedCampaign,
    },
  ];

  // ── Filtering (local-first) ────────────────────────────────────────────────
  const filteredChats = useMemo(() => {
    let list = [...chats];

    // Tab filter
    switch (activeFilter) {
      case 'Unread': list = list.filter((c) => c.unreadCount > 0); break;
      case 'Open': list = list.filter((c) => c.isOpen); break;
      case 'Starred': list = list.filter((c) => c.isStarred); break;
      case 'Assigned': list = list.filter((c) => Boolean(c.assignedToName)); break;
      case 'Referral': break; // referral not in local schema, skip
    }

    // Dropdown filters
    if (selectedChannel !== "All") {
      list = list.filter((c) => c.channel?.toLowerCase() === selectedChannel.toLowerCase());
    }
    if (selectedAccount !== "All") {
      list = list.filter((c) => c.socialAccountId === selectedAccount);
    }
    if (selectedLeadStatus !== "All") {
      list = list.filter((c) => c.leadStage?.toLowerCase() === selectedLeadStatus.toLowerCase());
    }

    // Search
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      list = list.filter((c) =>
        c.name?.toLowerCase().includes(q) ||
        c.phoneNumber?.toLowerCase().includes(q) ||
        c.lastMessage?.toLowerCase().includes(q)
      );
    }

    // Pinned first
    list.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    return list;
  }, [
    chats, activeFilter, searchText,
    selectedChannel, selectedAccount, selectedDepartment,
    selectedQuickAssist, selectedLeadStatus, selectedCampaign
  ]);

  // ── Pull-to-refresh ────────────────────────────────────────────────────────
  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await syncWithBackend();
    setIsRefreshing(false);
  }, [syncWithBackend]);

  // ── Multi-select ───────────────────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  // ── Chat actions (optimistic + API) ───────────────────────────────────────
  const togglePin = useCallback(async (chatId: string) => {
    // Optimistic update in SQLite
    const { db } = require('../db/client');
    const { chats: chatsTable } = require('../db/schema');
    const { eq } = require('drizzle-orm');
    const current = chats.find((c) => c.id === chatId);
    if (!current) return;
    const newVal = !current.pinned;
    await db.update(chatsTable).set({ pinned: newVal }).where(eq(chatsTable.id, chatId));
    await loadChats();
    // Fire API in background
    API.patch(`/chats/toggle-chat-pin/${chatId}`).catch((e) =>
      console.warn('[pin] API error:', e)
    );
  }, [chats]);

  const toggleStar = useCallback(async (chatId: string) => {
    const { db } = require('../db/client');
    const { chats: chatsTable } = require('../db/schema');
    const { eq } = require('drizzle-orm');
    const current = chats.find((c) => c.id === chatId);
    if (!current) return;
    const newVal = !current.isStarred;
    await db.update(chatsTable).set({ isStarred: newVal }).where(eq(chatsTable.id, chatId));
    await loadChats();
    API.patch(`/chats/toggle-chat-star/${chatId}`).catch((e) =>
      console.warn('[star] API error:', e)
    );
  }, [chats]);

  // ── Bulk actions ───────────────────────────────────────────────────────────
  const bulkStar = async () => {
    for (const id of selectedIds) await toggleStar(id);
    clearSelection();
  };

  const bulkPin = async () => {
    for (const id of selectedIds) await togglePin(id);
    clearSelection();
  };

  const bulkMute = () => {
    Alert.alert('Mute', `Mute ${selectedIds.size} chats? (feature coming soon)`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Mute', onPress: () => clearSelection() },
    ]);
  };

  const renderDropdownFilter = (filter: any, flex1: boolean = false) => (
    <NativeDropdown
      key={filter.label}
      expanded={openDropdown === filter.label}
      onDismissRequest={() => setOpenDropdown(null)}
      onRequestOpen={() => setOpenDropdown(filter.label)}
      style={flex1 ? { flex: 1, height: 38 } : { width: 140, height: 38 }}
      trigger={
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 12,
          borderRadius: 8,
          backgroundColor: '#eff4ff',
          borderWidth: 1,
          borderColor: 'rgba(0,50,107,0.15)',
          height: '100%',
          width: '100%',
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
            <Icon name={filter.icon as any} size={16} color="#00326b" />
            <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '600', color: '#00326b', flex: 1 }}>
              {filter.selectedValue === 'All' ? filter.label : filter.options.find((o: any) => o.value === filter.selectedValue)?.label || filter.selectedValue}
            </Text>
          </View>
          <Icon name="expand-more" size={18} color="#00326b" style={{ marginLeft: 4 }} />
        </View>
      }
      actions={filter.options.map((opt: any) => ({
        label: opt.label,
        onClick: () => filter.onSelect(opt.value),
      }))}
    />
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: '#f8f9ff' }}>

      {/* Search & Tab Filters */}
      <View style={{
        paddingHorizontal: 16, paddingTop: 8,
        paddingBottom: 8, backgroundColor: '#ffffff',
        borderBottomWidth: 1, borderBottomColor: 'rgba(0,50,107,0.08)',
        shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
      }}>
        {/* Top Dropdowns */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
          {topFilters.map((filter) => renderDropdownFilter(filter, true))}
        </View>

        {/* Search */}
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#eff4ff', borderRadius: 12, paddingHorizontal: 12, marginBottom: 10, height: 42 }}>
          <Icon name="search" size={20} color="#737782" />
          <TextInput
            style={{ flex: 1, marginLeft: 8, fontSize: 14, color: '#1a1a2e' }}
            placeholder="Search chats…"
            placeholderTextColor="#9aa0a6"
            value={searchText}
            onChangeText={setSearchText}
            clearButtonMode="while-editing"
          />
          {searchText.length > 0 && (
            <Pressable onPress={() => setSearchText('')}>
              <Icon name="cancel" size={18} color="#9aa0a6" />
            </Pressable>
          )}
        </View>

        {/* Tab filter pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {TAB_FILTERS.map((tab) => {
            const active = activeFilter === tab;
            return (
              <Pressable
                key={tab}
                onPress={() => setActiveFilter(tab)}
                style={{
                  paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
                  backgroundColor: active ? '#00326b' : '#eff4ff',
                  borderWidth: active ? 0 : 1,
                  borderColor: 'rgba(0,50,107,0.15)',
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: active ? '#ffffff' : '#00326b' }}>
                  {tab}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Bottom Dropdowns */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6, paddingTop: 10 }}
        >
          {dropdownFilters.map((filter) => renderDropdownFilter(filter, false))}
        </ScrollView>
      </View>

      {/* Chat list */}
      <View style={{ flex: 1 }}>
        {isSyncing && chats.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <LoadingSpinner size={44} iconName="sync" />
            <Text style={{ fontSize: 14, color: '#737782' }}>
              {syncProgress?.label ?? 'Loading chats…'}
            </Text>
            {(syncProgress?.chatsSynced ?? 0) > 0 && (
              <Text style={{ fontSize: 12, color: '#9aa0a6' }}>
                {syncProgress!.chatsSynced} chats synced
              </Text>
            )}
          </View>
        ) : filteredChats.length === 0 && !isSyncing ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <Icon name="inbox" size={48} color="#d0d6f9" />
            <Text style={{ fontSize: 15, color: '#9aa0a6' }}>
              {searchText ? 'No chats matching your search' : 'No chats in this filter'}
            </Text>
          </View>
        ) : (
          <FlashList
            data={filteredChats}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: 112 + Math.max(insets.bottom, 16) }}
            showsVerticalScrollIndicator={false}
            onRefresh={onRefresh}
            refreshing={isRefreshing}
            ListFooterComponent={
              isSyncing && chats.length > 0 ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12 }}>
                  <LoadingSpinner size={16} />
                  <Text style={{ fontSize: 12, color: '#9aa0a6' }}>
                    {syncProgress?.label ?? 'Syncing…'}
                  </Text>
                </View>
              ) : null
            }
            renderItem={({ item: chat }) => (
              <ChatRow
                chat={chat}
                selected={selectedIds.has(chat.id)}
                selecting={selecting}
                onPress={() => {
                  if (selecting) { toggleSelect(chat.id); }
                  else { router.push(`/chat/${chat.id}` as any); }
                }}
                onLongPress={() => toggleSelect(chat.id)}
              />
            )}
          />
        )}
      </View>

      {/* FAB with Speed Dial */}
      {!selecting && (
        <View style={{
          position: 'absolute',
          bottom: 96 + insets.bottom,
          right: 20,
          alignItems: 'flex-end',
          zIndex: 9999,
        }}>
          {fabExpanded && (
            <View style={{ alignItems: 'flex-end', marginBottom: 14, gap: 10 }}>
              {/* Option: Add Contact */}
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{
                  backgroundColor: 'rgba(0, 50, 107, 0.9)',
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 6,
                  marginRight: 10,
                }}>
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Add Contact</Text>
                </View>
                <Pressable
                  onPress={() => {
                    setFabExpanded(false);
                    router.setParams({ tab: 'contacts' });
                  }}
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 21,
                    backgroundColor: '#dde3f9',
                    alignItems: 'center',
                    justifyContent: 'center',
                    elevation: 4,
                    shadowColor: '#000',
                    shadowOpacity: 0.15,
                    shadowRadius: 4,
                    shadowOffset: { width: 0, height: 2 },
                  }}
                >
                  <Icon name="person-add" size={20} color="#00326b" />
                </Pressable>
              </View>

              {/* Option: New Chat */}
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{
                  backgroundColor: 'rgba(0, 50, 107, 0.9)',
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 6,
                  marginRight: 10,
                }}>
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>New Chat</Text>
                </View>
                <Pressable
                  onPress={() => {
                    setFabExpanded(false);
                    router.setParams({ tab: 'contacts' });
                  }}
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 21,
                    backgroundColor: '#dde3f9',
                    alignItems: 'center',
                    justifyContent: 'center',
                    elevation: 4,
                    shadowColor: '#000',
                    shadowOpacity: 0.15,
                    shadowRadius: 4,
                    shadowOffset: { width: 0, height: 2 },
                  }}
                >
                  <Icon name="chat" size={20} color="#00326b" />
                </Pressable>
              </View>
            </View>
          )}

          {/* Main FAB Toggle Button */}
          <Pressable
            onPress={() => setFabExpanded(!fabExpanded)}
            style={{
              width: 56,
              height: 56,
              borderRadius: 18,
              backgroundColor: '#00326b',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#00326b',
              shadowOpacity: 0.4,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 4 },
              elevation: 8,
            }}
          >
            <Icon name={fabExpanded ? "close" : "add"} size={28} color="#ffffff" />
          </Pressable>
        </View>
      )}
    </View>
  );
}
