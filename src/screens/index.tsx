import { ScrollView, View } from "react-native";
import { TopAppBar } from "../components/ui/TopAppBar";
import { Text } from "../components/ui/Text";
import { Icon } from "../components/ui/Icon";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 12,
          paddingTop: 16,
          paddingBottom: 112 + Math.max(insets.bottom, 16),
        }}
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-4">
          {/* Header Context */}
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="font-headline-md text-headline-md">Overview</Text>
              <Text className="text-on-surface-variant">Today's snapshot</Text>
            </View>
            <View className="bg-surface-container-lowest border border-outline-variant p-2 rounded-lg">
              <Icon name="filter-list" className="text-primary" />
            </View>
          </View>

          {/* Metrics Grid */}
          <View className="flex-row gap-3">
            <Card className="flex-1 h-32 justify-between p-4">
              <View className="flex-row items-start justify-between">
                <View className="p-2 bg-surface-container rounded-lg">
                  <Icon name="group" size={18} className="text-primary" />
                </View>
                <Badge variant="secondary" label="↑ 12%" />
              </View>
              <View>
                <Text className="font-caption text-caption text-on-surface-variant mb-1">Total Leads</Text>
                <Text className="font-headline-lg text-headline-lg">1,248</Text>
              </View>
            </Card>

            <Card className="flex-1 h-32 justify-between relative overflow-hidden p-4">
              <View className="absolute top-0 right-0 w-16 h-16 bg-surface-container rounded-bl-full opacity-50" />
              <View className="flex-row items-start justify-between relative z-10">
                <View className="p-2 bg-surface-container rounded-lg">
                  <Icon name="forum" size={18} className="text-primary" />
                </View>
              </View>
              <View className="relative z-10">
                <Text className="font-caption text-caption text-on-surface-variant mb-1">Active Chats</Text>
                <View className="flex-row items-end gap-2">
                  <Text className="font-headline-lg text-headline-lg">34</Text>
                  <View className="w-2 h-2 rounded-full bg-secondary mb-2" />
                </View>
              </View>
            </Card>
          </View>

          {/* Revenue Forecast */}
          <View className="bg-primary-container rounded-xl p-4 h-32 justify-between">
            <View className="flex-row items-center gap-3">
              <View className="p-2 bg-white/20 rounded-lg">
                <Icon name="payments" size={18} color="#fff" />
              </View>
              <Text className="font-body-lg font-medium text-white">Pipeline Forecast</Text>
            </View>
            <View className="flex-row items-end justify-between">
              <View>
                <Text className="font-headline-lg text-headline-lg text-white">$45,200</Text>
                <Text className="font-caption text-caption text-inverse-primary mt-1">Expected this quarter</Text>
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
              <Text className="font-body-lg font-medium">Lead Generation</Text>
              <Text className="font-caption text-caption text-on-surface-variant">Last 7 Days</Text>
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
                      className={`w-full rounded-t-md ${d.active ? 'bg-primary-container' : 'bg-surface-variant'}`}
                      style={{ height: `${d.height}%` }}
                    />
                    {d.active && (
                      <View className="absolute -top-6 bg-inverse-surface px-2 py-1 rounded">
                        <Text className="font-caption text-caption text-inverse-on-surface">{d.val}</Text>
                      </View>
                    )}
                  </View>
                  <Text className={`font-caption text-caption ${d.active ? 'text-primary font-medium' : 'text-on-surface-variant'}`}>
                    {d.day}
                  </Text>
                </View>
              ))}
            </View>
          </Card>

          {/* Recent Activity */}
          <Card className="p-4">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="font-body-lg font-medium">Recent Activity</Text>
              <Text className="font-label-md text-primary">View All</Text>
            </View>
            <View className="gap-4">
              <View className="flex-row items-start gap-3">
                <View className="w-8 h-8 rounded-full bg-secondary-container items-center justify-center">
                  <Icon name="check-circle" size={16} className="text-on-secondary-container" />
                </View>
                <View className="flex-1 pb-4 border-b border-surface-variant">
                  <Text className="leading-tight">
                    <Text className="font-medium">Sarah Jenkins</Text> marked deal TechCorp Renewal as{" "}
                    <Text className="text-secondary font-medium">Closed Won</Text>.
                  </Text>
                  <Text className="font-caption text-caption text-on-surface-variant mt-1">10 mins ago</Text>
                </View>
              </View>
              <View className="flex-row items-start gap-3">
                <View className="w-8 h-8 rounded-full bg-primary-fixed items-center justify-center">
                  <Icon name="person-add" size={16} className="text-primary" />
                </View>
                <View className="flex-1 pb-4 border-b border-surface-variant">
                  <Text className="leading-tight">
                    New lead <Text className="font-medium">Acme Industries</Text> assigned to you.
                  </Text>
                  <Text className="font-caption text-caption text-on-surface-variant mt-1">1 hour ago</Text>
                </View>
              </View>
              <View className="flex-row items-start gap-3">
                <View className="w-8 h-8 rounded-full bg-surface-container-high items-center justify-center">
                  <Icon name="event" size={16} className="text-on-surface-variant" />
                </View>
                <View className="flex-1">
                  <Text className="leading-tight">
                    Discovery call scheduled with <Text className="font-medium">Mike Ross</Text>.
                  </Text>
                  <Text className="font-caption text-caption text-on-surface-variant mt-1">3 hours ago</Text>
                </View>
              </View>
            </View>
          </Card>
        </View>
      </ScrollView>
    </View>
  );
}
