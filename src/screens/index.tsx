import { ScrollView, View, RefreshControl, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useCallback, useState } from "react";
import { Text } from "../components/ui/Text";
import { Icon } from "../components/ui/Icon";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeStore } from "../store/themeStore";
import { useSyncStore } from "../store/syncStore";
import API from "../config/axios";
import { useShellNav } from "../store/shellNavStore";

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

const DAY_MS = 24 * 60 * 60 * 1000;
const CHANNELS = [
  { key: "whatsapp", label: "WhatsApp" },
  { key: "messenger", label: "Messenger" },
  { key: "instagram", label: "Instagram" },
] as const;

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const isDark = useThemeStore((s) => s.isDark);
  const chats = useSyncStore((s) => s.chats);
  const syncWithBackend = useSyncStore((s) => s.syncWithBackend);
  const [refreshing, setRefreshing] = useState(false);
  const [pickedDay, setPickedDay] = useState<number | null>(null);

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
    const today0 = startOfDay.getTime();

    // Chats whose latest activity fell on each of the last 7 days (oldest first, today last)
    const days = Array.from({ length: 7 }, (_, i) => {
      const start = today0 - (6 - i) * DAY_MS;
      const d = new Date(start);
      return { start, label: i === 6 ? "Today" : d.toLocaleDateString([], { weekday: "short" }), count: 0 };
    });
    for (const c of real) {
      const t = new Date(c.updatedAt).getTime();
      if (Number.isNaN(t) || t < days[0].start) continue;
      const idx = Math.min(6, Math.floor((t - days[0].start) / DAY_MS));
      days[idx].count++;
    }

    const byChannel = CHANNELS.map((ch) => ({ ...ch, count: real.filter((c) => (c.channel ?? "whatsapp") === ch.key).length }));
    const open = real.filter((c) => c.isOpen).length;

    return {
      total: real.length,
      unreadChats: unreadChats.length,
      unreadMessages: unreadChats.reduce((sum, c) => sum + c.unreadCount, 0),
      open,
      closed: real.length - open,
      starred: real.filter((c) => c.isStarred).length,
      todayCount: days[6].count,
      days,
      byChannel,
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

  const tiles = [
    { key: "unread", filter: "Unread", label: "Unread chats", value: local.unreadChats, hint: local.unreadMessages ? `${local.unreadMessages.toLocaleString()} new messages` : "All caught up", icon: "mark-chat-unread", accent: true },
    { key: "open", filter: "Open", label: "Open chats", value: local.open, hint: "In progress", icon: "forum" },
    { key: "starred", filter: "Starred", label: "Starred", value: local.starred, hint: "Marked important", icon: "star" },
    { key: "today", filter: "All", label: "Active today", value: local.todayCount, hint: "Chats with activity", icon: "today" },
  ];

  const overview = [
    { label: "Contacts", value: statValue(tenant.contacts), icon: "contacts" },
    { label: "Messages", value: statValue(tenant.messages), icon: "chat" },
    { label: "Assigned", value: statValue(tenant.assignedChats), icon: "assignment-ind" },
    { label: "Templates", value: statValue(tenant.messageTemplates), icon: "description" },
    { label: "Campaigns", value: statValue(tenant.campaignsCurrentMonth ?? tenant.campaignsThisMonth), icon: "campaign" },
    { label: "Active team", value: loadingStats ? "…" : `${fmt(tenant.activeUsers)}/${fmt(tenant.users)}`, icon: "groups" },
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

  // ── shared styles ─────────────────────────────────────────────────────────
  const panel = { backgroundColor: colors.surfaceContainerLow, borderRadius: 18, padding: 16 } as const;
  const panelTitle = { fontSize: 15.5, lineHeight: 22, fontWeight: "700", color: colors.onSurface } as const;
  const panelHint = { fontSize: 12.5, lineHeight: 17, color: colors.outline } as const;
  const barTrack = isDark ? colors.surfaceContainerHigh : colors.surfaceContainerHighest;

  const maxDay = Math.max(1, ...local.days.map((d) => d.count));
  const shownDay = pickedDay ?? 6;
  const maxChannel = Math.max(1, ...local.byChannel.map((c) => c.count));
  // The server often reports no chat counts per department: then the bars show team size instead
  const deptChats = (d: any) => Number(d.chatCount || d.chats || 0);
  const deptMembers = (d: any) => Number(d.memberCount || d.members || 0);
  const deptByChats = departments.some((d: any) => deptChats(d) > 0);
  const deptValue = (d: any) => (deptByChats ? deptChats(d) : deptMembers(d));
  const maxDept = Math.max(1, ...departments.map(deptValue));
  const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
  const openPct = local.total ? local.open / local.total : 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 112 + Math.max(insets.bottom, 16), gap: 14 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} tintColor={colors.primary} />}
      >
        {stats.isError && (
          <Text style={{ fontSize: 13.5, color: colors.error }}>Workspace figures could not be loaded. Pull down to retry.</Text>
        )}

        {/* KPI tiles: tap to open Chats with that filter */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {tiles.map((t) => (
            <Pressable
              key={t.key}
              onPress={() => useShellNav.getState().openInbox(t.filter)}
              accessibilityRole="button"
              accessibilityLabel={`${t.label}: ${t.value}. Open in Chats`}
              android_ripple={{ color: colors.primaryTint }}
              className="active:opacity-80"
              style={{
                width: "48%",
                flexGrow: 1,
                minHeight: 116,
                borderRadius: 18,
                padding: 14,
                justifyContent: "space-between",
                backgroundColor: t.accent ? colors.primary : colors.surfaceContainerLow,
                overflow: "hidden",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: t.accent ? "rgba(255,255,255,0.16)" : colors.primaryTint }}>
                  <Icon name={t.icon as any} size={18} color={t.accent ? colors.onPrimary : colors.primary} />
                </View>
                <Icon name="chevron-right" size={20} color={t.accent ? colors.onPrimary : colors.outline} />
              </View>
              <View>
                <Text style={{ fontSize: 30, lineHeight: 36, fontWeight: "700", color: t.accent ? colors.onPrimary : colors.onSurface }}>
                  {t.value.toLocaleString()}
                </Text>
                <Text style={{ fontSize: 13.5, fontWeight: "600", color: t.accent ? colors.onPrimary : colors.onSurface }}>{t.label}</Text>
                <Text numberOfLines={1} style={{ fontSize: 12, color: t.accent ? "rgba(255,255,255,0.78)" : colors.outline }}>{t.hint}</Text>
              </View>
            </Pressable>
          ))}
        </View>

        {/* Activity, last 7 days (one series: no legend; tap a bar for its value) */}
        <View style={panel}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
            <View style={{ flex: 1 }}>
              <Text style={panelTitle}>Chat activity</Text>
              <Text style={panelHint}>Chats by day of their latest message, past 7 days</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ fontSize: 22, lineHeight: 28, fontWeight: "700", color: colors.onSurface }}>{local.days[shownDay].count}</Text>
              <Text style={panelHint}>{local.days[shownDay].label}</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", alignItems: "flex-end", height: 128, marginTop: 14, gap: 8 }}>
            {local.days.map((d, i) => {
              const h = d.count ? Math.max(6, Math.round((d.count / maxDay) * 112)) : 3;
              const on = i === shownDay;
              return (
                <Pressable
                  key={d.start}
                  onPress={() => setPickedDay(i)}
                  accessibilityRole="button"
                  accessibilityLabel={`${d.label}: ${d.count} chats`}
                  style={{ flex: 1, height: "100%", justifyContent: "flex-end" }}
                >
                  <View style={{ height: h, borderTopLeftRadius: 4, borderTopRightRadius: 4, backgroundColor: on ? colors.primary : d.count ? (isDark ? colors.primaryContainer : "#9bb3d6") : barTrack }} />
                </Pressable>
              );
            })}
          </View>
          <View style={{ height: 1, backgroundColor: colors.outlineVariant }} />
          <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
            {local.days.map((d, i) => (
              <Text key={d.start} numberOfLines={1} style={{ flex: 1, textAlign: "center", fontSize: 11, color: i === shownDay ? colors.onSurface : colors.outline, fontWeight: i === shownDay ? "700" : "400" }}>
                {d.label}
              </Text>
            ))}
          </View>
        </View>

        {/* Open vs closed, and chats by channel */}
        <View style={panel}>
          <Text style={panelTitle}>Conversations</Text>
          <Text style={panelHint}>{local.total.toLocaleString()} chats on this phone</Text>

          <View style={{ flexDirection: "row", height: 12, borderRadius: 6, overflow: "hidden", marginTop: 14, gap: 2 }}>
            {local.open > 0 && <View style={{ flex: local.open, backgroundColor: colors.primary }} />}
            {local.closed > 0 && <View style={{ flex: local.closed, backgroundColor: colors.outlineVariant }} />}
          </View>
          <View style={{ flexDirection: "row", gap: 18, marginTop: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: colors.primary }} />
              <Text style={{ fontSize: 13, color: colors.onSurfaceVariant }}>
                Open <Text style={{ fontWeight: "700", color: colors.onSurface }}>{local.open.toLocaleString()}</Text> ({Math.round(openPct * 100)}%)
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: colors.outlineVariant }} />
              <Text style={{ fontSize: 13, color: colors.onSurfaceVariant }}>
                Closed <Text style={{ fontWeight: "700", color: colors.onSurface }}>{local.closed.toLocaleString()}</Text>
              </Text>
            </View>
          </View>

          <Text style={[panelHint, { marginTop: 18, marginBottom: 4, fontWeight: "600", color: colors.onSurfaceVariant }]}>By channel</Text>
          {local.byChannel.map((ch) => (
            <View key={ch.key} style={{ flexDirection: "row", alignItems: "center", gap: 10, height: 32 }}>
              <Text style={{ width: 82, fontSize: 13.5, color: colors.onSurfaceVariant }}>{ch.label}</Text>
              <View style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: barTrack, overflow: "hidden" }}>
                {ch.count > 0 && <View style={{ width: `${Math.max(2, (ch.count / maxChannel) * 100)}%`, height: "100%", borderRadius: 5, backgroundColor: colors.primary }} />}
              </View>
              <Text style={{ width: 44, textAlign: "right", fontSize: 13.5, fontWeight: "700", color: colors.onSurface }}>{ch.count.toLocaleString()}</Text>
            </View>
          ))}
        </View>

        {/* Unread chats, newest first */}
        {local.needsReply.length > 0 && (
          <View style={panel}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <Text style={panelTitle}>Waiting for a reply</Text>
              <Pressable onPress={() => useShellNav.getState().openInbox("Unread")} hitSlop={10}>
                <Text style={{ fontSize: 13.5, fontWeight: "700", color: colors.primary }}>See all</Text>
              </Pressable>
            </View>
            {local.needsReply.map((c, i) => (
              <Pressable
                key={c.id}
                onPress={() => openChat(c)}
                android_ripple={{ color: colors.primaryTint }}
                className="active:opacity-70"
                style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 60, paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: colors.divider }}
              >
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryTint, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 15 }}>{(c.name || "?").charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: colors.onSurface, fontWeight: "700", fontSize: 15, lineHeight: 21 }} numberOfLines={1}>{c.name}</Text>
                  <Text style={{ color: colors.outline, fontSize: 13, lineHeight: 18 }} numberOfLines={1}>{c.lastMessage || timeAgo(c.updatedAt)}</Text>
                </View>
                <View style={{ backgroundColor: colors.unread, minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: colors.onUnread, fontSize: 12, lineHeight: 16, fontWeight: "700" }}>{c.unreadCount}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {/* Workspace figures from the server */}
        <View style={panel}>
          <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
            <Text style={panelTitle}>Workspace</Text>
            <Text style={panelHint}>Past month</Text>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 8 }}>
            {overview.map((o) => (
              <View key={o.label} style={{ width: "33.33%", paddingVertical: 10, paddingRight: 8 }}>
                <Icon name={o.icon as any} size={18} color={colors.primary} />
                <Text numberOfLines={1} style={{ fontSize: 18, lineHeight: 24, fontWeight: "700", color: colors.onSurface, marginTop: 4 }}>{o.value}</Text>
                <Text numberOfLines={1} style={{ fontSize: 12, color: colors.outline }}>{o.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {departments.length > 0 && (
          <View style={panel}>
            <Text style={panelTitle}>Department load</Text>
            <Text style={[panelHint, { marginBottom: 6 }]}>{deptByChats ? "Chats per department" : "Team members per department"}</Text>
            {[...departments].sort((a: any, b: any) => deptValue(b) - deptValue(a)).map((d: any, i: number) => {
              const n = deptValue(d);
              return (
                <View key={i} style={{ paddingVertical: 8 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                    <Text numberOfLines={1} style={{ flex: 1, fontSize: 13.5, color: colors.onSurface, fontWeight: "500" }}>
                      {d.name}{deptByChats ? <Text style={{ color: colors.outline, fontWeight: "400" }}> · {plural(deptMembers(d), "member")}</Text> : null}
                    </Text>
                    <Text style={{ fontSize: 13.5, fontWeight: "700", color: colors.onSurface }}>{n.toLocaleString()}</Text>
                  </View>
                  <View style={{ height: 8, borderRadius: 4, backgroundColor: barTrack, overflow: "hidden" }}>
                    {n > 0 && <View style={{ width: `${Math.max(2, (n / maxDept) * 100)}%`, height: "100%", borderRadius: 4, backgroundColor: colors.primary }} />}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <View style={panel}>
          <Text style={panelTitle}>Usage this billing cycle</Text>
          <Text style={[panelHint, { marginBottom: 4 }]}>Since your plan last renewed</Text>
          {usageRows.map((u, i) => (
            <View key={u.label} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 42, borderTopWidth: i ? 1 : 0, borderTopColor: colors.divider }}>
              <Text style={{ color: colors.onSurfaceVariant, fontSize: 14 }}>{u.label}</Text>
              <Text style={{ color: colors.onSurface, fontWeight: "700", fontSize: 14 }}>{statValue(u.value)}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
