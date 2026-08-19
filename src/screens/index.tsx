import { ScrollView, View, RefreshControl } from "react-native";
import { TopAppBar } from "../components/ui/TopAppBar";
import { Text } from "../components/ui/Text";
import { Icon } from "../components/ui/Icon";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeStore } from "../store/themeStore";
import { useSyncStore } from "../store/syncStore";
import { useState, useCallback } from "react";

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const isDark = useThemeStore((state) => state.isDark);
  const colors = useThemeStore((state) => state.colors);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const syncWithBackend = useSyncStore((state) => state.syncWithBackend);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    let isMounted = true;
    const timer = setTimeout(() => {
      if (isMounted) setIsRefreshing(false);
    }, 5000);

    (async () => {
      try {
        await syncWithBackend();
      } catch (err) {
        console.warn("Background dashboard sync error:", err);
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 12,
          paddingTop: 16,
          paddingBottom: 112 + Math.max(insets.bottom, 16),
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        <View className="gap-4">
          {/* Header Context */}
          <View className="flex-row items-center justify-between">
            <View>
              <Text style={{ fontSize: 20, fontWeight: "700", color: colors.onSurface }}>Overview</Text>
              <Text style={{ fontSize: 13.5, color: colors.outline, marginTop: 2 }}>Today's snapshot</Text>
            </View>
            <View 
              style={{
                backgroundColor: colors.surfaceContainerLowest,
                borderColor: colors.divider,
                borderWidth: 1,
              }}
              className="p-2 rounded-lg"
            >
              <Icon name="filter-list" size={20} color={colors.primary} />
            </View>
          </View>

          {/* Metrics Grid */}
          <View className="flex-row gap-3">
            <Card className="flex-1 h-32 justify-between p-4">
              <View className="flex-row items-start justify-between">
                <View 
                  style={{ backgroundColor: colors.surfaceContainerLow }}
                  className="p-2 rounded-lg"
                >
                  <Icon name="group" size={18} color={colors.primary} />
                </View>
                <Badge variant="secondary" label="↑ 12%" />
              </View>
              <View>
                <Text style={{ fontSize: 12, color: colors.outline, marginBottom: 2 }}>Total Leads</Text>
                <Text style={{ fontSize: 22, fontWeight: "800", color: colors.onSurface }}>1,248</Text>
              </View>
            </Card>

            <Card className="flex-1 h-32 justify-between relative overflow-hidden p-4">
              <View 
                style={{ backgroundColor: colors.surfaceContainerLow, opacity: 0.5 }}
                className="absolute top-0 right-0 w-16 h-16 rounded-bl-full" 
              />
              <View className="flex-row items-start justify-between relative z-10">
                <View 
                  style={{ backgroundColor: colors.surfaceContainerLow }}
                  className="p-2 rounded-lg"
                >
                  <Icon name="forum" size={18} color={colors.primary} />
                </View>
              </View>
              <View className="relative z-10">
                <Text style={{ fontSize: 12, color: colors.outline, marginBottom: 2 }}>Active Chats</Text>
                <View className="flex-row items-end gap-2">
                  <Text style={{ fontSize: 22, fontWeight: "800", color: colors.onSurface }}>34</Text>
                  <View 
                    style={{ backgroundColor: isDark ? "#4ade80" : "#10b981" }}
                    className="w-2.5 h-2.5 rounded-full mb-1.5" 
                  />
                </View>
              </View>
            </Card>
          </View>

          {/* Revenue Forecast */}
          <View 
            style={{
              backgroundColor: isDark ? "#00326b" : "#00326b",
              borderRadius: 14,
              padding: 16,
              height: 130,
              justifyContent: "space-between",
            }}
          >
            <View className="flex-row items-center gap-3">
              <View className="p-2 bg-white/20 rounded-lg">
                <Icon name="payments" size={18} color="#fff" />
              </View>
              <Text style={{ fontSize: 15, fontWeight: "600", color: "#ffffff" }}>Pipeline Forecast</Text>
            </View>
            <View className="flex-row items-end justify-between">
              <View>
                <Text style={{ fontSize: 22, fontWeight: "800", color: "#ffffff" }}>$45,200</Text>
                <Text style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.75)", marginTop: 2 }}>Expected this quarter</Text>
              </View>
              <View className="h-10 w-24 flex-row items-end gap-1 opacity-80">
                {[30, 50, 40, 80, 60, 100].map((h, i) => (
                  <View key={i} className="flex-1 bg-white rounded-t-sm" style={{ height: `${h}%` }} />
                ))}
              </View>
            </View>
          </View>

          {/* Lead Generation Chart Mock */}
          <Card className="p-4">
            <View className="flex-row items-center justify-between mb-6">
              <Text style={{ fontSize: 15.5, fontWeight: "700", color: colors.onSurface }}>Lead Generation</Text>
              <Text style={{ fontSize: 12.5, color: colors.outline }}>Last 7 Days</Text>
            </View>
            <View className="h-40 flex-row items-end justify-between gap-2 px-1">
              {[
                { day: "M", height: 40, val: 12 },
                { day: "T", height: 60, val: 18 },
                { day: "W", height: 35, val: 10 },
                { day: "T", height: 85, val: 26, active: true },
                { day: "F", height: 50, val: 0 },
                { day: "S", height: 20, val: 0 },
                { day: "S", height: 10, val: 0 },
              ].map((d, i) => (
                <View key={i} className="flex-1 items-center gap-2 h-full justify-end">
                  <View className="w-full relative justify-end items-center" style={{ height: "100%" }}>
                    <View 
                      style={{ 
                        height: `${d.height}%`,
                        backgroundColor: d.active ? colors.primary : colors.surfaceContainerLow,
                      }}
                      className="w-full rounded-t-md"
                    />
                    {d.active && (
                      <View 
                        style={{
                          position: "absolute",
                          top: -24,
                          backgroundColor: colors.primary,
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                          borderRadius: 4,
                        }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: "700", color: colors.onPrimary }}>{d.val}</Text>
                      </View>
                    )}
                  </View>
                  <Text 
                    style={{ 
                      fontSize: 12, 
                      fontWeight: d.active ? "700" : "500",
                      color: d.active ? colors.primary : colors.outline,
                    }}
                  >
                    {d.day}
                  </Text>
                </View>
              ))}
            </View>
          </Card>

          {/* Recent Activity */}
          <Card className="p-4">
            <View className="flex-row items-center justify-between mb-4">
              <Text style={{ fontSize: 15.5, fontWeight: "700", color: colors.onSurface }}>Recent Activity</Text>
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.primary }}>View All</Text>
            </View>
            <View className="gap-4">
              <View className="flex-row items-start gap-3">
                <View 
                  style={{ backgroundColor: isDark ? "rgba(37, 211, 102, 0.15)" : "#e6f9ed" }}
                  className="w-8 h-8 rounded-full items-center justify-center"
                >
                  <Icon name="check-circle" size={16} color={isDark ? "#4ade80" : "#10b981"} />
                </View>
                <View 
                  style={{ borderBottomColor: colors.divider }}
                  className="flex-1 pb-4 border-b"
                >
                  <Text style={{ color: colors.onSurface, lineHeight: 20 }}>
                    <Text style={{ fontWeight: "600", color: colors.onSurface }}>Sarah Jenkins</Text> marked deal TechCorp Renewal as{" "}
                    <Text style={{ fontWeight: "600", color: isDark ? "#4ade80" : "#10b981" }}>Closed Won</Text>.
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.outline, marginTop: 4 }}>10 mins ago</Text>
                </View>
              </View>
              <View className="flex-row items-start gap-3">
                <View 
                  style={{ backgroundColor: isDark ? "rgba(171, 199, 255, 0.15)" : "#eff4ff" }}
                  className="w-8 h-8 rounded-full items-center justify-center"
                >
                  <Icon name="person-add" size={16} color={colors.primary} />
                </View>
                <View 
                  style={{ borderBottomColor: colors.divider }}
                  className="flex-1 pb-4 border-b"
                >
                  <Text style={{ color: colors.onSurface, lineHeight: 20 }}>
                    New lead <Text style={{ fontWeight: "600", color: colors.onSurface }}>Acme Industries</Text> assigned to you.
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.outline, marginTop: 4 }}>1 hour ago</Text>
                </View>
              </View>
              <View className="flex-row items-start gap-3">
                <View 
                  style={{ backgroundColor: isDark ? "rgba(255, 255, 255, 0.08)" : "#f0f2f5" }}
                  className="w-8 h-8 rounded-full items-center justify-center"
                >
                  <Icon name="event" size={16} color={colors.outline} />
                </View>
                <View className="flex-1">
                  <Text style={{ color: colors.onSurface, lineHeight: 20 }}>
                    Discovery call scheduled with <Text style={{ fontWeight: "600", color: colors.onSurface }}>Mike Ross</Text>.
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.outline, marginTop: 4 }}>3 hours ago</Text>
                </View>
              </View>
            </View>
          </Card>
        </View>
      </ScrollView>
    </View>
  );
}
