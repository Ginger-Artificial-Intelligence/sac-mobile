import { ScrollView, View, TextInput, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Text } from "../../../components/ui/Text";
import { Icon } from "../../../components/ui/Icon";
import { Avatar } from "../../../components/ui/Avatar";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ContactRemindersScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-background">
      {/* Top App Bar */}
      <View 
        className="bg-surface border-b border-outline-variant flex-row items-center justify-between px-4 pb-3 shrink-0 z-10"
        style={{ paddingTop: Math.max(insets.top, 16) }}
      >
        <View className="flex-row items-center gap-3">
          <Pressable 
            className="active:opacity-70"
            onPress={() => router.back()}
          >
            <Icon name="close" size={24} className="text-primary" />
          </Pressable>
          <Text className="font-headline-lg text-primary">Contact info</Text>
        </View>
      </View>

      <ScrollView 
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 112 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Header Card */}
        <View className="bg-surface-container rounded-xl p-6 items-center">
          <View className="mb-4">
            <Avatar fallback="S" size={80} />
          </View>
          <Text className="font-headline-md mb-1">Souken Labs</Text>
          <View className="flex-row items-center gap-1 mb-2">
            <Icon name="call" size={16} className="text-on-surface-variant" />
            <Text className="font-body-md text-on-surface-variant">+91 7012990510</Text>
          </View>
          <View className="bg-surface-bright px-3 py-1 rounded-full flex-row items-center gap-2">
            <Icon name="chat" size={16} color="#25D366" />
            <Text className="font-label-md text-on-surface">@soukenlr90</Text>
          </View>
        </View>

        {/* Tabs */}
        <View className="flex-row border-b border-outline-variant">
          <Pressable 
            className="flex-1 py-3 items-center border-b-2 border-transparent active:bg-surface-container-low"
            onPress={() => router.replace(`/contact/${id}/` as any)}
          >
            <Text className="font-body-md text-on-surface-variant">Details</Text>
          </Pressable>
          <Pressable className="flex-1 py-3 items-center border-b-2 border-primary">
            <Text className="font-label-lg text-primary">Reminders</Text>
          </Pressable>
        </View>

        {/* Content */}
        <View className="space-y-6">
          {/* Set a New Reminder Card */}
          <View className="bg-surface-container-low rounded-xl p-4 space-y-4">
            <View className="flex-row items-center gap-2">
              <Icon name="notifications-active" size={24} className="text-on-surface" />
              <Text className="font-headline-md text-on-surface">Set a New Reminder</Text>
            </View>
            <View className="bg-surface-bright rounded-lg border border-outline-variant p-3 mt-4">
              <TextInput
                className="w-full bg-transparent font-body-md text-on-surface"
                placeholder="Reminder text"
                placeholderTextColor="#737782"
                multiline
                numberOfLines={2}
                style={{ textAlignVertical: "top" }}
              />
            </View>
            <View className="relative mt-4">
              <Text className="absolute -top-2 left-3 bg-surface-container-low px-1 font-label-md text-on-surface-variant z-10">Reminder Time</Text>
              <View className="w-full border border-primary rounded-lg px-3 py-3 flex-row justify-between items-center bg-transparent mt-1">
                <Text className="font-body-md text-on-surface">08/16/2026 02:26 PM</Text>
                <Icon name="calendar-today" size={20} className="text-on-surface-variant" />
              </View>
            </View>
            <Pressable className="w-full bg-primary-container items-center justify-center py-3 rounded-full mt-4 active:opacity-80">
              <Text className="font-label-lg text-on-primary-container">Add Reminder</Text>
            </Pressable>
          </View>

          {/* Upcoming Reminders Section */}
          <View className="space-y-4 mt-6">
            <Text className="font-headline-md text-on-surface">Upcoming Reminders</Text>
            <View className="py-12 items-center">
              <Text className="font-body-md text-on-surface-variant">No pending reminders for this chat.</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
