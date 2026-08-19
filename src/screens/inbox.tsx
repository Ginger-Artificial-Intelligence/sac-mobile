import {
  ScrollView, View, TextInput, Pressable,
  Alert,
} from "react-native";
import { Text } from "../components/ui/Text";
import { Icon } from "../components/ui/Icon";
import { LoadingSpinner } from "../components/ui/Loading";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useState, useEffect, useCallback, useMemo, memo } from "react";
import { useSyncStore, Chat } from "../store/syncStore";
import { FlashList } from "@shopify/flash-list";
import API from "../config/axios";
import { NativeDropdown } from "../components/ui/NativeDropdown";
import { storage } from "../store/mmkv";
import { useThemeStore } from "../store/themeStore";
import { HapticPressable } from "@/components/ui/HapticPressable";
import { Image } from "expo-image";

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

// ─── Chat Avatar (image or initials) ─────────────────────────────────────────
const ChatAvatar = memo(({ avatar, name, size, isDark, primaryColor }: {
  avatar: string | null;
  name: string;
  size: number;
  isDark: boolean;
  primaryColor: string;
}) => {
  const [imgError, setImgError] = useState(false);
  const isUrl = !imgError && avatar
    ? (avatar.startsWith('http://') || avatar.startsWith('https://'))
    : false;
  const initial = (avatar && avatar.length <= 2) ? avatar : (name?.charAt(0)?.toUpperCase() ?? '?');

  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2, marginRight: 12,
      backgroundColor: isDark ? '#1e3048' : '#dde3f9',
      alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
    }}>
      {isUrl ? (
        <Image
          source={{ uri: avatar! }}
          style={{ width: size, height: size }}
          onError={() => setImgError(true)}
        />
      ) : (
        <Text style={{ fontSize: size * 0.375, fontWeight: '700', color: primaryColor }}>
          {initial}
        </Text>
      )}
    </View>
  );
});


// ─── Individual chat row (selection & actions) ─────────────────────────
const ChatRow = memo(
  ({
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
    const isDark = useThemeStore((state) => state.isDark);
    const colors = useThemeStore((state) => state.colors);

    const hasUnread = chat.unreadCount > 0;

    const formattedTime = useMemo(() => {
      if (!chat.updatedAt) return "";

      return new Date(chat.updatedAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    }, [chat.updatedAt]);

    const initial =
      chat.avatar && chat.avatar.length <= 2
        ? chat.avatar
        : chat.name?.charAt(0)?.toUpperCase() ?? "?";

    return (
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={350}
        style={({ pressed }) => ({
          width: "100%",
          minHeight: 72,

          flexDirection: "row",
          alignItems: "center",

          paddingHorizontal: 16,
          paddingVertical: 10,

          backgroundColor: selected
            ? isDark
              ? "#1a293d"
              : "#e8eeff"
            : pressed
              ? isDark
                ? "rgba(255,255,255,0.06)"
                : "rgba(0,50,107,0.05)"
              : colors.surfaceContainerLowest,
        })}
      >
        {/* Selection */}
        {selecting && (
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,

              borderWidth: 2,
              borderColor: selected
                ? colors.primary
                : colors.outline,

              backgroundColor: selected
                ? colors.primary
                : "transparent",

              alignItems: "center",
              justifyContent: "center",

              marginRight: 10,
            }}
          >
            {selected && (
              <Icon
                name="check"
                size={14}
                color="#fff"
              />
            )}
          </View>
        )}

        {/* Avatar */}
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,

            marginRight: 12,

            backgroundColor: isDark
              ? "#1e3048"
              : "#dde3f9",

            alignItems: "center",
            justifyContent: "center",

            overflow: "hidden",

            flexShrink: 0,
          }}
        >
          {chat.avatar?.startsWith("http") ? (
            <Image
              source={{ uri: chat.avatar }}
              style={{
                width: 52,
                height: 52,
              }}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          ) : (
            <Text
              style={{
                fontSize: 19,
                fontWeight: "700",
                color: colors.primary,
              }}
            >
              {initial}
            </Text>
          )}
        </View>

        {/* Main content */}
        <View
          style={{
            flex: 1,
            minWidth: 0,
            justifyContent: "center",
          }}
        >
          {/* Name + time */}
          <View
            style={{
              width: "100%",
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 4,
            }}
          >
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={{
                flex: 1,
                minWidth: 0,

                fontSize: 15,
                fontWeight: hasUnread
                  ? "700"
                  : "600",

                color: colors.onSurface,
              }}
            >
              {chat.name}
            </Text>

            <Text
              style={{
                marginLeft: 8,

                fontSize: 11,
                fontWeight: hasUnread
                  ? "600"
                  : "400",

                color: hasUnread
                  ? colors.secondary
                  : colors.outline,

                flexShrink: 0,
              }}
            >
              {formattedTime}
            </Text>
          </View>

          {/* Last message */}
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={{
              fontSize: 13,

              color: hasUnread
                ? colors.onSurface
                : colors.outline,

              fontWeight: hasUnread
                ? "500"
                : "400",
            }}
          >
            {chat.lastMessage || " "}
          </Text>
        </View>

        {/* Unread / pin */}
        <View
          style={{
            width: 28,

            marginLeft: 8,

            alignItems: "center",
            justifyContent: "center",

            flexShrink: 0,
          }}
        >
          {hasUnread ? (
            <View
              style={{
                minWidth: 20,
                height: 20,

                paddingHorizontal: 5,

                borderRadius: 10,

                backgroundColor: colors.secondary,

                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  color: colors.onPrimary,
                  fontSize: 10,
                  fontWeight: "700",
                }}
              >
                {chat.unreadCount > 99
                  ? "99+"
                  : chat.unreadCount}
              </Text>
            </View>
          ) : chat.pinned ? (
            <Icon
              name="push-pin"
              size={17}
              color={colors.outline}
            />
          ) : null}
        </View>
      </Pressable>
    );
  }
);

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

  // Cached Filter options state
  const [accounts, setAccounts] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [keywords, setKeywords] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);

  const loadCachedFilters = useCallback(() => {
    try {
      const accStr = storage.getString('cached_social_accounts');
      if (accStr) setAccounts(JSON.parse(accStr));

      const depStr = storage.getString('cached_departments');
      if (depStr) setDepartments(JSON.parse(depStr));

      const kwStr = storage.getString('cached_keywords');
      if (kwStr) setKeywords(JSON.parse(kwStr));

      const campStr = storage.getString('cached_campaigns');
      if (campStr) setCampaigns(JSON.parse(campStr));
    } catch (e) {
      console.warn("Failed to load cached filter options:", e);
    }
  }, []);

  useEffect(() => {
    loadCachedFilters();
  }, [isSyncing]);

  const accountOptions = useMemo(() => {
    const opts = [{ label: "All Accounts", value: "All", channel: "all", phoneNumber: "" }];
    accounts.forEach((acc: any) => {
      const id = acc.phoneNumberId || acc.phone_number_id || acc.accountId || acc.account_id || acc._id;
      const label = acc.name || acc.phoneNumber || acc.phoneNumberId || acc.accountLabel || acc.accountName;
      const channel = acc.channel || "whatsapp";
      const phoneNumber = channel.toLowerCase() === 'whatsapp' ? (acc.phoneNumber || acc.phone_number || "") : "";
      if (id) opts.push({ label, value: id, channel, phoneNumber });
    });
    return opts;
  }, [accounts]);

  const departmentOptions = useMemo(() => {
    const opts = [{ label: "All Departments", value: "All" }];
    departments.forEach((dep: any) => {
      const id = dep.id || dep._id;
      const name = dep.name || dep.departmentName || "Department";
      if (id) opts.push({ label: name, value: id });
    });
    return opts;
  }, [departments]);

  const quickAssistOptions = useMemo(() => {
    const opts = [{ label: "All Keywords", value: "All" }];
    keywords.forEach((kw: any) => {
      const val = kw.keyword || kw.name || kw.id || kw._id;
      if (val) opts.push({ label: val, value: val });
    });
    return opts;
  }, [keywords]);

  const campaignOptions = useMemo(() => {
    const opts = [{ label: "All Campaigns", value: "All" }];
    campaigns.forEach((camp: any) => {
      const id = camp.id || camp._id;
      const name = camp.name || camp.title || "Campaign";
      if (id) opts.push({ label: name, value: id });
    });
    return opts;
  }, [campaigns]);

  const totalUnreadChats = useMemo(() => {
    return chats.filter(c => c.unreadCount > 0).length;
  }, [chats]);

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
      options: accountOptions,
      onSelect: setSelectedAccount,
    },
  ];

  const dropdownFilters = [
    {
      label: "Department",
      icon: "domain",
      selectedValue: selectedDepartment,
      options: departmentOptions,
      onSelect: setSelectedDepartment,
    },
    {
      label: "Quick Assist",
      icon: "flash-on",
      selectedValue: selectedQuickAssist,
      options: quickAssistOptions,
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
      options: campaignOptions,
      onSelect: setSelectedCampaign,
    },
  ];

  // ── Filtering (local-first, fast property checks without JSON.parse) ─────
  const filteredChats = useMemo(() => {
    let list = chats;

    // Tab filter
    if (activeFilter === 'Unread') list = list.filter((c) => c.unreadCount > 0);
    else if (activeFilter === 'Open') list = list.filter((c) => c.isOpen);
    else if (activeFilter === 'Starred') list = list.filter((c) => c.isStarred);
    else if (activeFilter === 'Assigned') list = list.filter((c) => Boolean(c.assignedToName));

    // Dropdown filters
    if (selectedChannel !== "All") {
      list = list.filter((c) => c.channel?.toLowerCase() === selectedChannel.toLowerCase());
    }
    if (selectedAccount !== "All") {
      list = list.filter((c) => c.socialAccountId === selectedAccount || c.accountId === selectedAccount);
    }
    if (selectedLeadStatus !== "All") {
      list = list.filter((c) => c.leadStage?.toLowerCase() === selectedLeadStatus.toLowerCase());
    }
    if (selectedDepartment !== "All") {
      list = list.filter((c) => c.departmentId === selectedDepartment);
    }
    if (selectedQuickAssist !== "All") {
      list = list.filter((c) => c.quickAssistKeyword?.toLowerCase() === selectedQuickAssist.toLowerCase());
    }
    if (selectedCampaign !== "All") {
      list = list.filter((c) => c.campaignId === selectedCampaign);
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

    return list;
  }, [
    chats, activeFilter, searchText,
    selectedChannel, selectedAccount, selectedDepartment,
    selectedQuickAssist, selectedLeadStatus, selectedCampaign
  ]);

  // ── Pull-to-refresh (max 5s UI spinner, background sync continues) ───────
  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    let isMounted = true;
    const timer = setTimeout(() => {
      if (isMounted) setIsRefreshing(false);
    }, 5000);

    (async () => {
      try {
        await syncWithBackend();
        try {
          await useSyncStore.getState().fetchAndCacheFilterOptions();
        } catch (_) { }
      } catch (err) {
        console.warn("Background inbox sync error:", err);
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

  // ── Multi-select ───────────────────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  const bulkSetStarred = useSyncStore((state) => state.bulkSetStarred);
  const bulkSetPinned = useSyncStore((state) => state.bulkSetPinned);

  // ── Chat actions (optimistic + batch API) ─────────────────────────────────
  const togglePin = useCallback(async (chatId: string) => {
    const current = chats.find((c) => c.id === chatId);
    if (!current) return;
    await bulkSetPinned([chatId], !current.pinned);
  }, [chats, bulkSetPinned]);

  const toggleStar = useCallback(async (chatId: string) => {
    const current = chats.find((c) => c.id === chatId);
    if (!current) return;
    await bulkSetStarred([chatId], !current.isStarred);
  }, [chats, bulkSetStarred]);

  // ── Bulk actions ───────────────────────────────────────────────────────────
  const bulkStar = () => {
    bulkSetStarred(Array.from(selectedIds), true);
  };

  const bulkPin = () => {
    bulkSetPinned(Array.from(selectedIds), true);
  };

  const isDark = useThemeStore((state) => state.isDark);
  const colors = useThemeStore((state) => state.colors);

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
          backgroundColor: colors.surfaceContainerLow,
          borderWidth: 1,
          borderColor: colors.divider,
          height: '100%',
          width: '100%',
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
            <Icon name={filter.icon as any} size={16} color={colors.primary} />
            <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '600', color: colors.primary, flex: 1 }}>
              {filter.selectedValue === 'All' ? filter.label : filter.options.find((o: any) => o.value === filter.selectedValue)?.label || filter.selectedValue}
            </Text>
          </View>
          <Icon name="expand-more" size={18} color={colors.primary} style={{ marginLeft: 4 }} />
        </View>
      }
      actions={filter.options.map((opt: any) => ({
        label: opt.label,
        onClick: () => filter.onSelect(opt.value),
        channel: opt.channel,
        phoneNumber: opt.phoneNumber,
        icon: opt.icon,
      }))}
    />
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>

      {/* Search & Tab Filters */}
      <View style={{
        paddingHorizontal: 16, paddingTop: 8,
        paddingBottom: 8, backgroundColor: colors.surfaceContainerLowest,
        borderBottomWidth: 1, borderBottomColor: colors.divider,
        shadowColor: '#000', shadowOpacity: isDark ? 0.2 : 0.04, shadowRadius: 4, elevation: 2,
      }}>
        {/* Top Dropdowns */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
          {topFilters.map((filter) => renderDropdownFilter(filter, true))}
        </View>

        {/* Search */}
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceContainerLow, borderRadius: 12, paddingHorizontal: 12, marginBottom: 10, height: 44 }}>
          <Icon name="search" size={20} color={colors.outline} />
          <TextInput
            style={{ flex: 1, marginLeft: 8, fontSize: 15, color: colors.onSurface }}
            placeholder="Search chats…"
            placeholderTextColor={colors.outline}
            value={searchText}
            onChangeText={setSearchText}
            clearButtonMode="while-editing"
          />
          {searchText.length > 0 && (
            <Pressable onPress={() => setSearchText('')}>
              <Icon name="cancel" size={18} color={colors.outline} />
            </Pressable>
          )}
        </View>

        {/* Tab filter pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {TAB_FILTERS.map((tab) => {
            const active = activeFilter === tab;
            const displayLabel = tab === 'Unread' ? `Unread (${totalUnreadChats})` : tab;
            return (
              <HapticPressable
                hapticType="heavy"
                key={tab}
                onPress={() => setActiveFilter(tab)}
                style={{
                  paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
                  backgroundColor: active ? colors.primary : colors.surfaceContainerLow,
                  borderWidth: active ? 0 : 1,
                  borderColor: colors.divider,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: active ? colors.onPrimary : colors.primary }}>
                  {displayLabel}
                </Text>
              </HapticPressable>
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
                  if (selecting) {
                    toggleSelect(chat.id);
                  } else {
                    router.push({
                      pathname: `/chat/${chat.id}`,
                      params: {
                        name: chat.name,
                        avatar: chat.avatar || '',
                        channel: chat.channel || '',
                        accountId: chat.accountId || '',
                      },
                    } as any);
                  }
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
              {/* Option: Sync Filters */}
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{
                  backgroundColor: 'rgba(0, 50, 107, 0.9)',
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 6,
                  marginRight: 10,
                }}>
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Sync Filters</Text>
                </View>
                <Pressable
                  onPress={async () => {
                    setFabExpanded(false);
                    try {
                      Alert.alert("Syncing", "Refetching filter options and template libraries...");
                      await useSyncStore.getState().fetchAndCacheFilterOptions();
                      Alert.alert("Success", "Filters and templates synced successfully!");
                    } catch (e) {
                      Alert.alert("Error", "Failed to sync filters.");
                    }
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
                  <Icon name="sync" size={20} color="#00326b" />
                </Pressable>
              </View>

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
