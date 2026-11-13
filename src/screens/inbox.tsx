import {
  ScrollView, View, TextInput, Pressable, Platform,
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
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useShellNav } from "../store/shellNavStore";

// ─── Tab filter mapping (matches ChatFilterTab from v1) ───────────────────────
type FilterTab = "All" | "Unread" | "Open" | "Closed" | "Starred" | "Referral" | "Assigned";

const TAB_FILTERS: FilterTab[] = ["All", "Unread", "Open", "Closed", "Starred", "Referral", "Assigned"];

// Lead statuses are configured per workspace, so colour by meaning: lost/fake red, won green, rest blue
function leadChipColors(status: string, colors: ReturnType<typeof useThemeStore.getState>["colors"]) {
  const s = status.toLowerCase();
  if (/lost|fake/.test(s)) return { bg: colors.errorContainer, text: colors.error };
  if (/won/.test(s)) return { bg: colors.secondaryContainer, text: colors.secondary };
  return { bg: colors.primaryTint, text: colors.primary };
}

// Brand colours of each channel's own mark, shown small on the avatar so a mixed inbox scans by channel
const CHANNEL_MARK: Record<string, { icon: "whatsapp" | "facebook-messenger" | "instagram"; color: string }> = {
  whatsapp: { icon: "whatsapp", color: "#25d366" },
  messenger: { icon: "facebook-messenger", color: "#0084ff" },
  instagram: { icon: "instagram", color: "#e1306c" },
};

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
        // A plain style object: with NativeWind a style function here drops the row layout.
        // iPhone has no ripple, so it gets an opacity press state from the class instead.
        className={Platform.OS === "ios" ? "active:opacity-60" : undefined}
        style={{
          width: "100%",
          minHeight: 72,

          flexDirection: "row",
          alignItems: "center",

          paddingLeft: 16,

          backgroundColor: selected ? colors.primaryTint : colors.surface,
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

            backgroundColor: colors.primaryTint,

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
              <Icon name="groups" size={26} color={colors.primary} />
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

        {/* Channel mark on the avatar's corner (WhatsApp / Messenger / Instagram) */}
        {CHANNEL_MARK[chat.channel ?? ""] && (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: (selecting ? 48 : 16) + 34,
              top: 46,
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: CHANNEL_MARK[chat.channel!].color,
              borderWidth: 2,
              borderColor: selected ? colors.primaryTint : colors.surface,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MaterialCommunityIcons name={CHANNEL_MARK[chat.channel!].icon} size={12} color="#ffffff" />
          </View>
        )}

        {/* Main content + trailing badges share the hairline that starts after the avatar */}
        <View
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 72,
            flexDirection: "row",
            alignItems: "center",
            paddingRight: 16,
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderBottomColor: colors.divider,
          }}
        >
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

                fontSize: 16.5,
                lineHeight: 22,
                fontWeight: hasUnread
                  ? "700"
                  : "500",

                color: colors.onSurface,
              }}
            >
              {chat.name}
            </Text>

            <Text
              style={{
                marginLeft: 8,

                fontSize: 12,
                fontWeight: hasUnread
                  ? "700"
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

          {/* Last message (the line is left out when there is none, so the row stays compact) */}
          {(chat.isGroup || !!chat.lastMessage) && <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={{
              fontSize: 14,
              lineHeight: 20,

              color: hasUnread
                ? colors.onSurface
                : colors.outline,

              fontWeight: hasUnread
                ? "500"
                : "400",
            }}
          >
            {chat.isGroup ? "Group · " : ""}
            {chat.lastMessage || ""}
          </Text>}

          {/* Status line: lead stage, keyword, open/closed, SLA. Quiet text; only real alerts get a filled pill */}
          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
            {!!chat.leadStage && (() => {
              const lead = leadChipColors(chat.leadStage!, colors);
              return (
                <View style={{ backgroundColor: lead.bg, borderRadius: 9, paddingHorizontal: 7, height: 18, justifyContent: "center" }}>
                  <Text numberOfLines={1} style={{ fontSize: 11, lineHeight: 14, fontWeight: "700", color: lead.text, maxWidth: 110 }}>
                    {chat.leadStage}
                  </Text>
                </View>
              );
            })()}
            <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: chat.isOpen ? "500" : "400", color: chat.isOpen ? colors.onSurfaceVariant : colors.outline }}>
              {chat.isOpen ? "Open" : "Closed"}
            </Text>
            {!!chat.assignedToName && (
              <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, color: colors.outline, maxWidth: 110 }}>
                {chat.assignedToName}
              </Text>
            )}
            {!!chat.quickAssistKeyword && (
              <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, color: colors.outline, maxWidth: 100 }}>
                {chat.quickAssistKeyword}
              </Text>
            )}
            {chat.replyTimeoutStatus === "escalated" ? (
              <View style={{ backgroundColor: colors.errorContainer, borderRadius: 9, paddingHorizontal: 7, height: 18, justifyContent: "center" }}>
                <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: "700", color: colors.error }}>Escalated</Text>
              </View>
            ) : chat.replyTimeoutStatus === "pending" ? (
              <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: "600", color: colors.warning }}>
                SLA {chat.slaType || "FRT"}
              </Text>
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
              {chat.isStarred && <Icon name="star" size={16} color={colors.star} />}
              {chat.pinned && <Icon name="push-pin" size={16} color={colors.outline} />}
            </View>
          )}
          {hasUnread ? (
            <View
              style={{
                minWidth: 22,
                height: 22,

                paddingHorizontal: 6,

                borderRadius: 11,

                backgroundColor: colors.unread,

                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  color: colors.onUnread,
                  fontSize: 12,
                  lineHeight: 16,
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
  const inboxNonce = useShellNav((s) => s.inboxNonce);
  useEffect(() => {
    const f = useShellNav.getState().inboxFilter as FilterTab | null;
    if (inboxNonce > 0 && f && TAB_FILTERS.includes(f)) setActiveFilter(f);
  }, [inboxNonce]);
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

  const [showFilters, setShowFilters] = useState(false);

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

  const isDark = useThemeStore((state) => state.isDark);
  const colors = useThemeStore((state) => state.colors);


  const activeDropdownCount = [...topFilters, ...dropdownFilters].filter((f) => f.selectedValue !== 'All').length;

  const renderDropdownFilter = (filter: any, flex1: boolean = false) => (
    <NativeDropdown
      key={filter.label}
      expanded={openDropdown === filter.label}
      onDismissRequest={() => setOpenDropdown(null)}
      onRequestOpen={() => setOpenDropdown(filter.label)}
      style={flex1 ? { flex: 1, height: 36 } : { width: 156, height: 36 }}

      trigger={
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 14,
          borderRadius: 18,
          backgroundColor: filter.selectedValue === 'All' ? colors.surfaceContainerLow : colors.primaryTint,
          height: '100%',
          width: '100%',
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
            <Icon name={filter.icon as any} size={16} color={filter.selectedValue === 'All' ? colors.onSurfaceVariant : colors.primary} />
            <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: filter.selectedValue === 'All' ? '500' : '700', color: filter.selectedValue === 'All' ? colors.onSurfaceVariant : colors.primary, flex: 1 }}>
              {filter.selectedValue === 'All' ? filter.label : filter.options.find((o: any) => o.value === filter.selectedValue)?.label || filter.selectedValue}
            </Text>
          </View>
          <Icon name="expand-more" size={18} color={colors.outline} style={{ marginLeft: 4 }} />
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
        paddingBottom: 10, backgroundColor: colors.surface,
      }}>
        {/* Search */}
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceContainerLow, borderRadius: 24, paddingLeft: 16, paddingRight: 6, marginBottom: 12, height: 48 }}>
          <Icon name="search" size={22} color={colors.outline} />
          <View style={{ flex: 1, marginLeft: 10, justifyContent: "center" }}>
            {/* The native placeholder ignores the app font on some Samsung phones, so it is drawn as Text */}
            {searchText.length === 0 && (
              <Text pointerEvents="none" numberOfLines={1} style={{ position: "absolute", left: 0, right: 0, fontSize: 16, color: colors.outline }}>
                Search chats
              </Text>
            )}
            <TextInput
              style={{ fontSize: 16, color: colors.onSurface, fontFamily: "PlusJakartaSans_400Regular", padding: 0 }}
              accessibilityLabel="Search chats"
              value={searchText}
              onChangeText={setSearchText}
              clearButtonMode="while-editing"
            />
          </View>
          {searchText.length > 0 && (
            <Pressable onPress={() => setSearchText('')} hitSlop={10} accessibilityLabel="Clear search">
              <Icon name="cancel" size={20} color={colors.outline} />
            </Pressable>
          )}
          <Pressable
            onPress={() => setShowFilters((v) => !v)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={activeDropdownCount ? `Filters, ${activeDropdownCount} on` : "Filters"}
            accessibilityState={{ expanded: showFilters }}
            style={{ marginLeft: 8, height: 36, paddingHorizontal: 10, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: showFilters || activeDropdownCount ? colors.primaryTint : 'transparent' }}
          >
            <Icon name="tune" size={20} color={showFilters || activeDropdownCount ? colors.primary : colors.onSurfaceVariant} />
            {activeDropdownCount > 0 && (
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>{activeDropdownCount}</Text>
            )}
          </Pressable>
        </View>

        {/* Tab filter pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {TAB_FILTERS.map((tab) => {
            const active = activeFilter === tab;
            const displayLabel = tab === 'Unread' && totalUnreadChats > 0 ? `Unread ${totalUnreadChats}` : tab;
            return (
              <HapticPressable
                hapticType="heavy"
                key={tab}
                onPress={() => setActiveFilter(tab)}
                hitSlop={{ top: 6, bottom: 6 }}
                style={{
                  paddingHorizontal: 14, height: 36, justifyContent: 'center', borderRadius: 18,
                  backgroundColor: active ? colors.primaryTint : colors.surfaceContainerLow,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: active ? '700' : '500', color: active ? colors.primary : colors.onSurfaceVariant }}>
                  {displayLabel}
                </Text>
              </HapticPressable>
            );
          })}
        </ScrollView>

        {/* Dropdown filters (channel, account, department…) open from the button in the search bar */}
        {showFilters && <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingTop: 10 }}
        >
          {[...topFilters, ...dropdownFilters].map((filter) => renderDropdownFilter(filter, false))}
        </ScrollView>}
      </View>

      {/* Chat list */}
      <View style={{ flex: 1 }}>
        {isSyncing && chats.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <LoadingSpinner size={44} iconName="sync" />
            <Text style={{ fontSize: 14, color: colors.outline }}>
              {syncProgress?.label ?? 'Loading chats…'}
            </Text>
            {(syncProgress?.chatsSynced ?? 0) > 0 && (
              <Text style={{ fontSize: 12, color: colors.outline }}>
                {syncProgress!.chatsSynced} chats synced
              </Text>
            )}
          </View>
        ) : filteredChats.length === 0 && !isSyncing ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <Icon name="inbox" size={48} color={colors.outlineVariant} />
            <Text style={{ fontSize: 15, color: colors.outline }}>
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
                  <Text style={{ fontSize: 13, color: colors.outline }}>
                    Loading more chats…
                  </Text>
                </View>
              ) : isSyncing && chats.length > 0 ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12 }}>
                  <LoadingSpinner size={16} />
                  <Text style={{ fontSize: 12, color: colors.outline }}>
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
          bottom: 84 + insets.bottom,
          right: 16,
          alignItems: 'flex-end',
          zIndex: 9999,
        }}>
          {fabExpanded && (
            <View style={{ alignItems: 'flex-end', marginBottom: 14, gap: 10 }}>
              {/* Option: Sync Filters */}
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{
                  backgroundColor: isDark ? colors.surfaceContainerHighest : colors.onSurface,
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
                    backgroundColor: colors.primaryTint,
                    alignItems: 'center',
                    justifyContent: 'center',
                    elevation: 4,
                    shadowColor: '#000',
                    shadowOpacity: 0.15,
                    shadowRadius: 4,
                    shadowOffset: { width: 0, height: 2 },
                  }}
                >
                  <Icon name="sync" size={20} color={colors.primary} />
                </Pressable>
              </View>

              {/* Option: Add Contact */}
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{
                  backgroundColor: isDark ? colors.surfaceContainerHighest : colors.onSurface,
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
                    backgroundColor: colors.primaryTint,
                    alignItems: 'center',
                    justifyContent: 'center',
                    elevation: 4,
                    shadowColor: '#000',
                    shadowOpacity: 0.15,
                    shadowRadius: 4,
                    shadowOffset: { width: 0, height: 2 },
                  }}
                >
                  <Icon name="person-add" size={20} color={colors.primary} />
                </Pressable>
              </View>

              {/* Option: New Chat */}
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{
                  backgroundColor: isDark ? colors.surfaceContainerHighest : colors.onSurface,
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
                    backgroundColor: colors.primaryTint,
                    alignItems: 'center',
                    justifyContent: 'center',
                    elevation: 4,
                    shadowColor: '#000',
                    shadowOpacity: 0.15,
                    shadowRadius: 4,
                    shadowOffset: { width: 0, height: 2 },
                  }}
                >
                  <Icon name="chat" size={20} color={colors.primary} />
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
              backgroundColor: colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#000',
              shadowOpacity: 0.4,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 4 },
              elevation: 8,
            }}
          >
            <Icon name={fabExpanded ? "close" : "add"} size={28} color={colors.onPrimary} />
          </Pressable>
        </View>
      )}
    </View>
  );
}
