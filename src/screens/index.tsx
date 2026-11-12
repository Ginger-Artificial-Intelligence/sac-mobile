import { ScrollView, View, RefreshControl, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Text } from "../components/ui/Text";
import { Icon } from "../components/ui/Icon";
import { Card } from "../components/ui/Card";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeStore } from "../store/themeStore";
import { useSyncStore } from "../store/syncStore";
import API from "../config/axios";
import { useMemo, useCallback, useState } from "react";

const DASH = "—";
const toCount = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
};
const fmt = (v: unknown) => {
  const n = toCount(v);
  return n === null ? DASH : n.toLocaleString();
};

// Same endpoint and one-month window as the web dashboard
async function fetchStats() {
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - 1);
  const res = await API.get("/utils/dashboard/statistics", {
    params: { startDate: start.toISOString().split("T")[0], endDate: end.toISOString().split("T")[0] },
  });
  return res.data?.stats ?? null;
}

const timeAgo = (iso?: string | null) => {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.floor(h / 24)} d ago`;
};

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const chats = useSyncStore((s) => s.chats);
  const userName = useSyncStore((s) => s.userName);
  const syncWithBackend = useSyncStore((s) => s.syncWithBackend);
  const [refreshing, setRefreshing] = useState(false);

  const stats = useQuery({ queryKey: ["dashboard-stats"], queryFn: fetchStats, staleTime: 2 * 60 * 1000, retry: 1 });
  const tenant = stats.data?.tenantOverview ?? {};
  const usage = stats.data?.usage ?? {};
  const departments: any[] = stats.data?.departments ?? [];

  // Live figures from the chats on this phone (always available, even offline)
  const local = useMemo(() => {
    const real = chats.filter((c) => !c.isBlocked);
    const unreadChats = real.filter((c) => c.unreadCount > 0);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return {
      total: real.length,
      unreadChats: unreadChats.length,
      unreadMessages: unreadChats.reduce((sum, c) => sum + c.unreadCount, 0),
      open: real.filter((c) => c.isOpen).length,
      starred: real.filter((c) => c.isStarred).length,
      groups: real.filter((c) => c.isGroup).length,
      todayCount: real.filter((c) => new Date(c.updatedAt).getTime() >= startOfDay.getTime()).length,
      needsReply: [...unreadChats]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 5),
    };
  }, [chats]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.allSettled([syncWithBackend(), stats.refetch()]);
    } finally {
      setRefreshing(false);
    }
  }, [syncWithBackend, stats]);

  const loadingStats = stats.isLoading;
  const statValue = (v: unknown) => (loadingStats ? "…" : fmt(v));

  const queue = [
    { key: "unread", label: "Unread chats", value: local.unreadChats, hint: local.unreadMessages ? `${local.unreadMessages} new messages` : "All caught up", icon: "mark-chat-unread", critical: local.unreadChats > 0 },
    { key: "open", label: "Open chats", value: local.open, hint: "Conversations in progress", icon: "forum" },
    { key: "starred", label: "Starred chats", value: local.starred, hint: "Marked as important", icon: "star" },
    { key: "today", label: "Active today", value: local.todayCount, hint: "Chats with activity today", icon: "today" },
  ];

  const overview = [
    { label: "Contacts", value: statValue(tenant.contacts), icon: "contacts" },
    { label: "Messages stored", value: statValue(tenant.messages), icon: "chat" },
    { label: "Assigned chats", value: statValue(tenant.assignedChats), icon: "assignment-ind" },
    { label: "Templates", value: statValue(tenant.messageTemplates), icon: "description" },
    { label: "Campaigns this month", value: statValue(tenant.campaignsCurrentMonth ?? tenant.campaignsThisMonth), icon: "campaign" },
    { label: "Active team", value: loadingStats ? "…" : `${fmt(tenant.activeUsers)} / ${fmt(tenant.users)}`, icon: "groups" },
  ];

  const usageRows = [
    { label: "CRM messages", value: usage.crmMessages },
    { label: "Campaign messages", value: usage.campaignMessages },
    { label: "Conversations", value: usage.conversations },
    { label: "API requests", value: usage.apiRequests },
    { label: "Webhooks received", value: usage.webhooksReceived },
  ];

  const openChat = (c: (typeof chats)[number]) =>
    router.push({
      pathname: `/chat/${c.id}`,
      params: { name: c.name, channel: c.channel ?? "whatsapp", accountId: c.accountId ?? "", phoneNumber: c.phoneNumber ?? "" },
    } as any);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 16, paddingBottom: 112 + Math.max(insets.bottom, 16) }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} tintColor={colors.primary} />}
      >
        <View className="gap-4">
          <View>
            <Text style={{ fontSize: 20, fontWeight: "700", color: colors.onSurface }}>
              {userName ? `Hi, ${userName.split(" ")[0]}` : "Overview"}
            </Text>
            <Text style={{ fontSize: 13.5, color: colors.outline, marginTop: 2 }}>
              {stats.isError ? "Workspace figures could not be loaded. Pull down to retry." : "Your inbox and workspace at a glance"}
            </Text>
          </View>

          {/* Needs you now: from the chats on this phone */}
          <Text style={{ fontSize: 15.5, fontWeight: "700", color: colors.onSurface }}>Needs you now</Text>
          <View className="flex-row flex-wrap gap-3">
            {queue.map((q) => (
              <Card key={q.key} className="p-4 justify-between" style={{ width: "47.5%", minHeight: 112, borderColor: q.critical ? "#ef4444" : undefined }}>
                <View className="flex-row items-center justify-between">
                  <Text style={{ fontSize: 12.5, color: colors.outline, fontWeight: "600" }}>{q.label}</Text>
                  <Icon name={q.icon as any} size={18} color={q.critical ? "#ef4444" : colors.primary} />
                </View>
                <View>
                  <Text style={{ fontSize: 28, fontWeight: "800", color: q.critical ? "#ef4444" : colors.onSurface }}>{q.value.toLocaleString()}</Text>
                  <Text style={{ fontSize: 11.5, color: colors.outline }} numberOfLines={1}>{q.hint}</Text>
                </View>
              </Card>
            ))}
          </View>

          {/* Unread chats list */}
          {local.needsReply.length > 0 && (
            <Card className="p-4">
              <Text style={{ fontSize: 15.5, fontWeight: "700", color: colors.onSurface, marginBottom: 8 }}>Waiting for a reply</Text>
              {local.needsReply.map((c, i) => (
                <Pressable
                  key={c.id}
                  onPress={() => openChat(c)}
                  className="flex-row items-center gap-3 py-3 active:opacity-70"
                  style={{ borderTopColor: colors.divider, borderTopWidth: i ? 1 : 0 }}
                >
                  <View style={{ backgroundColor: colors.surfaceContainerLow }} className="w-9 h-9 rounded-full items-center justify-center">
                    <Text style={{ color: colors.primary, fontWeight: "700" }}>{(c.name || "?").charAt(0).toUpperCase()}</Text>
                  </View>
                  <View className="flex-1">
                    <Text style={{ color: colors.onSurface, fontWeight: "600", fontSize: 14 }} numberOfLines={1}>{c.name}</Text>
                    <Text style={{ color: colors.outline, fontSize: 12 }} numberOfLines={1}>{c.lastMessage || "New message"}</Text>
                  </View>
                  <View className="items-end gap-1">
                    <Text style={{ color: colors.outline, fontSize: 11 }}>{timeAgo(c.updatedAt)}</Text>
                    <View style={{ backgroundColor: colors.primary }} className="min-w-[20px] h-5 px-1.5 rounded-full items-center justify-center">
                      <Text style={{ color: colors.onPrimary, fontSize: 11, fontWeight: "700" }}>{c.unreadCount}</Text>
                    </View>
                  </View>
                </Pressable>
              ))}
            </Card>
          )}

          {/* Workspace overview: from the server */}
          <View className="flex-row items-center justify-between">
            <Text style={{ fontSize: 15.5, fontWeight: "700", color: colors.onSurface }}>Workspace overview</Text>
            <Text style={{ fontSize: 12, color: colors.outline }}>Past month</Text>
          </View>
          <View className="flex-row flex-wrap gap-3">
            {overview.map((o) => (
              <Card key={o.label} className="p-3" style={{ width: "47.5%" }}>
                <View className="flex-row items-center gap-2 mb-1">
                  <Icon name={o.icon as any} size={16} color={colors.primary} />
                  <Text style={{ fontSize: 12, color: colors.outline }} numberOfLines={1}>{o.label}</Text>
                </View>
                <Text style={{ fontSize: 20, fontWeight: "800", color: colors.onSurface }}>{o.value}</Text>
              </Card>
            ))}
          </View>

          {departments.length > 0 && (
            <Card className="p-4">
              <Text style={{ fontSize: 15.5, fontWeight: "700", color: colors.onSurface, marginBottom: 8 }}>Department load</Text>
              {departments.map((d: any, i: number) => (
                <View key={i} className="flex-row items-center justify-between py-2.5" style={{ borderTopColor: colors.divider, borderTopWidth: i ? 1 : 0 }}>
                  <View className="flex-1">
                    <Text style={{ color: colors.onSurface, fontWeight: "600", fontSize: 14 }} numberOfLines={1}>{d.name}</Text>
                    <Text style={{ color: colors.outline, fontSize: 12 }}>{d.memberCount || d.members || 1} members</Text>
                  </View>
                  <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 13 }}>{d.chatCount || d.chats || 0} chats</Text>
                </View>
              ))}
            </Card>
          )}

          <Card className="p-4">
            <Text style={{ fontSize: 15.5, fontWeight: "700", color: colors.onSurface }}>Usage this billing cycle</Text>
            <Text style={{ fontSize: 12, color: colors.outline, marginBottom: 8 }}>Counters since your plan last renewed</Text>
            {usageRows.map((u, i) => (
              <View key={u.label} className="flex-row items-center justify-between py-2.5" style={{ borderTopColor: colors.divider, borderTopWidth: i ? 1 : 0 }}>
                <Text style={{ color: colors.onSurface, fontSize: 13.5 }}>{u.label}</Text>
                <Text style={{ color: colors.onSurface, fontWeight: "700", fontSize: 13.5 }}>{statValue(u.value)}</Text>
              </View>
            ))}
          </Card>
        </View>
      </ScrollView>
    </View>
  );
}
