import {
  ScrollView, View, TextInput, Pressable,
  Alert,
} from "react-native";
import { Text } from "../components/ui/Text";
import { Icon } from "../components/ui/Icon";
import { LoadingSpinner } from "../components/ui/Loading";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useState, useEffect, useCallback, useMemo, memo, useRef, useDeferredValue } from "react";
import { useNewContactSheet } from "../store/newContactStore";
import { useSyncStore, Chat } from "../store/syncStore";
import { refreshExpiredAvatar } from "../hooks/useSocialProfile";
import { FlashList } from "@shopify/flash-list";
import API from "../config/axios";
import { NativeDropdown } from "../components/ui/NativeDropdown";
import { storage } from "../store/mmkv";
import { useThemeStore } from "../store/themeStore";
import { HapticPressable } from "@/components/ui/HapticPressable";
import { Image } from "expo-image";

// ─── Tab filter mapping (matches ChatFilterTab from v1) ───────────────────────
type FilterTab = "All" | "Unread" | "Open" | "Closed" | "Starred" | "Referral" | "Assigned";

const TAB_FILTERS: FilterTab[] = ["All", "Unread", "Open", "Closed", "Starred", "Referral", "Assigned"];

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

// Lead statuses are configured per workspace, so colour by meaning: lost/fake red, won green, rest blue
function leadChipColors(status: string, isDark: boolean) {
  const s = status.toLowerCase();
  if (/lost|fake/.test(s)) return { bg: "rgba(244, 67, 54, 0.12)", text: "#f44336", border: "rgba(244, 67, 54, 0.35)" };
  if (/won/.test(s)) return { bg: "rgba(34, 197, 94, 0.14)", text: isDark ? "#4ade80" : "#15803d", border: "rgba(34, 197, 94, 0.4)" };
  return { bg: "rgba(59, 130, 246, 0.12)", text: isDark ? "#93c5fd" : "#1d4ed8", border: "rgba(59, 130, 246, 0.35)" };
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
        onPressIn={() => useSyncStore.getState().prefetchMessages(chat.id)}
        onLongPress={onLongPress}
        delayLongPress={350}
        android_ripple={{
          color: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 50, 107, 0.08)",
          foreground: true,
        }}
        style={{
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
            : colors.surfaceContainerLowest,
        }}
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
              onError={() => refreshExpiredAvatar(chat.id, chat.avatar)}
            />
          ) : (
            chat.isGroup ? (
              <Icon name="groups" size={28} color="#25D366" />
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
            )
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
            {chat.isGroup ? "Group · " : ""}
            {chat.lastMessage || " "}
          </Text>

          {/* Status chips: lead status, quick-assist keyword, open/closed, SLA / escalation */}
          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
            {!!chat.leadStage && (() => {
              const lead = leadChipColors(chat.leadStage!, isDark);
              return (
                <View style={{ backgroundColor: lead.bg, borderColor: lead.border, borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 9, fontWeight: "800", color: lead.text, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    {chat.leadStage}
                  </Text>
                </View>
              );
            })()}
            {!!chat.quickAssistKeyword && (
              <Text numberOfLines={1} style={{ fontSize: 11, color: colors.outline, maxWidth: 110 }}>
                {chat.quickAssistKeyword}
              </Text>
            )}
            <Text style={{ fontSize: 11, fontWeight: "500", color: chat.isOpen ? "#16a34a" : "#d97706" }}>
              {chat.isOpen ? "Open" : "Closed"}
            </Text>
            {chat.replyTimeoutStatus === "escalated" ? (
              <View style={{ backgroundColor: "rgba(244, 67, 54, 0.12)", borderColor: "rgba(244, 67, 54, 0.4)", borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ fontSize: 9, fontWeight: "800", color: "#f44336", textTransform: "uppercase" }}>Escalated</Text>
              </View>
            ) : chat.replyTimeoutStatus === "pending" ? (
              <View style={{ backgroundColor: "rgba(255, 152, 0, 0.12)", borderColor: "rgba(255, 152, 0, 0.3)", borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ fontSize: 9, fontWeight: "700", color: "#ff9800", textTransform: "uppercase" }}>
                  SLA: {chat.slaType || "FRT"}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Unread / pin */}
        <View
          style={{
            minWidth: 28,

            marginLeft: 8,

            alignItems: "center",
            justifyContent: "center",

            flexShrink: 0,
            gap: 6,
          }}
        >
          {/* Star and pin show alongside the unread badge, not instead of it */}
          {(chat.isStarred || chat.pinned) && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              {chat.isStarred && <Icon name="star" size={16} color="#FFC107" />}
              {chat.pinned && <Icon name="push-pin" size={16} color={colors.outline} />}
            </View>
          )}
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
          ) : null}
        </View>
      </Pressable>
    );
  },
  (prev, next) =>
    prev.selected === next.selected &&
    prev.selecting === next.selecting &&
    prev.chat.id === next.chat.id &&
    prev.chat.updatedAt === next.chat.updatedAt &&
    prev.chat.unreadCount === next.chat.unreadCount &&
    prev.chat.lastMessage === next.chat.lastMessage &&
    prev.chat.pinned === next.chat.pinned &&
    prev.chat.isStarred === next.chat.isStarred &&
    prev.chat.name === next.chat.name &&
    prev.chat.isGroup === next.chat.isGroup &&
    prev.chat.leadStage === next.chat.leadStage &&
    prev.chat.isOpen === next.chat.isOpen &&
    prev.chat.quickAssistKeyword === next.chat.quickAssistKeyword &&
    prev.chat.replyTimeoutStatus === next.chat.replyTimeoutStatus &&
    prev.chat.slaType === next.chat.slaType &&
    prev.chat.avatar === next.chat.avatar
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
  const isLoadingMoreChats = useSyncStore((state) => state.isLoadingMoreChats);
  const hasMoreChats = useSyncStore((state) => state.hasMoreChats);
  const loadMoreChats = useSyncStore((state) => state.loadMoreChats);

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

  // ── Filtering (single pass, local-first, fast property checks without JSON.parse) ─────
  // The pill / dropdown label / search box update on the next frame; the (heavier) list re-filter
  // follows at lower priority instead of blocking the tap
  const filterInput = useMemo(
    () => ({
      activeFilter, searchText, selectedChannel, selectedAccount,
      selectedDepartment, selectedQuickAssist, selectedLeadStatus, selectedCampaign,
    }),
    [activeFilter, searchText, selectedChannel, selectedAccount,
      selectedDepartment, selectedQuickAssist, selectedLeadStatus, selectedCampaign]
  );
  const deferredFilters = useDeferredValue(filterInput);

  const filteredChats = useMemo(() => {
    const {
      activeFilter, searchText, selectedChannel, selectedAccount,
      selectedDepartment, selectedQuickAssist, selectedLeadStatus, selectedCampaign,
    } = deferredFilters;
    const hasTabFilter = activeFilter !== 'All' && activeFilter !== 'Referral';
    const hasChannel = selectedChannel !== 'All';
    const hasAccount = selectedAccount !== 'All';
    const hasLead = selectedLeadStatus !== 'All';
    const hasDept = selectedDepartment !== 'All';
    const hasQA = selectedQuickAssist !== 'All';
    const hasCamp = selectedCampaign !== 'All';
    const cleanSearch = searchText.trim().toLowerCase();
    const hasSearch = cleanSearch.length > 0;

    if (!hasTabFilter && !hasChannel && !hasAccount && !hasLead && !hasDept && !hasQA && !hasCamp && !hasSearch) {
      return chats;
    }

    const channelLower = hasChannel ? selectedChannel.toLowerCase() : '';
    const leadLower = hasLead ? selectedLeadStatus.toLowerCase() : '';
    const qaLower = hasQA ? selectedQuickAssist.toLowerCase() : '';

    return chats.filter((c) => {
      // Tab filter
      if (activeFilter === 'Unread' && c.unreadCount <= 0) return false;
      if (activeFilter === 'Open' && !c.isOpen) return false;
      if (activeFilter === 'Closed' && c.isOpen) return false; // closed = isOpen false/missing, as on the web
      if (activeFilter === 'Starred' && !c.isStarred) return false;
      if (activeFilter === 'Assigned' && !c.assignedToName) return false;

      // Dropdown filters
      if (hasChannel && c.channel?.toLowerCase() !== channelLower) return false;
      if (hasAccount && c.socialAccountId !== selectedAccount && c.accountId !== selectedAccount) return false;
      if (hasLead && c.leadStage?.toLowerCase() !== leadLower) return false;
      if (hasDept && c.departmentId !== selectedDepartment) return false;
      if (hasQA && c.quickAssistKeyword?.toLowerCase() !== qaLower) return false;
      if (hasCamp && c.campaignId !== selectedCampaign) return false;

      // Search
      if (hasSearch) {
        const matchesName = c.name?.toLowerCase().includes(cleanSearch);
        const matchesPhone = c.phoneNumber?.toLowerCase().includes(cleanSearch);
        const matchesLast = c.lastMessage?.toLowerCase().includes(cleanSearch);
        if (!matchesName && !matchesPhone && !matchesLast) return false;
      }

      return true;
    });
  }, [chats, deferredFilters]);

  // ── Pull-to-refresh: Fast local SQLite reload (<100ms) without heavy sync APIs ───────
  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    let isMounted = true;
    (async () => {
      try {
        await loadChats();
      } catch (err) {
        console.warn("Inbox local reload error:", err);
      } finally {
        if (isMounted) setIsRefreshing(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [loadChats]);

  // ── Multi-select ───────────────────────────────────────────────────────────
  const toggleSelect = useCallback((id: string) => {
    const current = useSyncStore.getState().selectedChatIds;
    const next = new Set(current);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    useSyncStore.getState().setSelectedChatIds(next);
  }, []);

  const isNavigatingRef = useRef(false);

  const handleChatPress = useCallback((chat: Chat) => {
    if (selectedIds.size > 0) {
      toggleSelect(chat.id);
      return;
    }

    // Debounce / Navigation lock: prevent opening multiple chat screens on rapid clicks
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;
    setTimeout(() => {
      isNavigatingRef.current = false;
    }, 600);

    router.push({
      pathname: `/chat/${chat.id}`,
      params: {
        name: chat.name,
        avatar: chat.avatar || '',
        channel: chat.channel || '',
        accountId: chat.accountId || '',
        phoneNumber: chat.phoneNumber || '',
      },
    } as any);
  }, [selectedIds.size, toggleSelect, router]);

  const handleChatLongPress = useCallback((chat: Chat) => {
    toggleSelect(chat.id);
  }, [toggleSelect]);

  const renderItem = useCallback(({ item: chat }: { item: Chat }) => (
    <ChatRow
      chat={chat}
      selected={selectedIds.has(chat.id)}
      selecting={selectedIds.size > 0}
      onPress={() => handleChatPress(chat)}
      onLongPress={() => handleChatLongPress(chat)}
    />
  ), [selectedIds, handleChatPress, handleChatLongPress]);

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
  // If every selected chat already has the flag, the button removes it; otherwise it sets it on all
  const bulkStar = () => {
    const ids = Array.from(selectedIds);
    const allOn = ids.every((id) => chats.find((c) => c.id === id)?.isStarred);
    bulkSetStarred(ids, !allOn);
  };

  const bulkPin = () => {
    const ids = Array.from(selectedIds);
    const allOn = ids.every((id) => chats.find((c) => c.id === id)?.pinned);
    bulkSetPinned(ids, !allOn);
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

  const handleEndReached = useCallback(() => {
    // Stop background sync / load more if hasMoreChats is false
    if (!hasMoreChats || isLoadingMoreChats || searchText.trim().length > 0) {
      return;
    }
    loadMoreChats();
  }, [searchText, isLoadingMoreChats, hasMoreChats, loadMoreChats]);

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
            onEndReached={hasMoreChats ? handleEndReached : undefined}
            onEndReachedThreshold={0.4}

            ListFooterComponent={
              isLoadingMoreChats ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 }}>
                  <LoadingSpinner size={18} />
                  <Text style={{ fontSize: 13, color: '#9aa0a6' }}>
                    Loading more chats…
                  </Text>
                </View>
              ) : isSyncing && chats.length > 0 ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12 }}>
                  <LoadingSpinner size={16} />
                  <Text style={{ fontSize: 12, color: '#9aa0a6' }}>
                    {syncProgress?.label ?? 'Syncing…'}
                  </Text>
                </View>
              ) : null
            }
            renderItem={renderItem}
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
                    useNewContactSheet.getState().open('contact');
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
                    useNewContactSheet.getState().open('chat');
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
