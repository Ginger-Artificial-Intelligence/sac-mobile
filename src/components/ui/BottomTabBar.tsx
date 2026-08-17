import { View, Pressable } from "react-native";
import { Text } from "./Text";
import { Icon } from "./Icon";
import { cn } from "../../lib/utils";

interface BottomTabBarProps {
  selectedIndex: number;
  onSelect: (index: number) => void;
}

export function BottomTabBar({ selectedIndex, onSelect }: BottomTabBarProps) {
  const tabs = [
    { name: "Chats", icon: "chat" },
    { name: "Contacts", icon: "contacts" },
    { name: "Dashboard", icon: "dashboard" },
    { name: "Profile", icon: "person" }
  ];

  return (
    <View className="absolute bottom-6 left-6 right-6 z-50">
      <View className="bg-surface-container/95 border border-outline-variant/30 rounded-3xl flex-row justify-around items-center py-2 px-3 shadow-lg shadow-black/10">
        {tabs.map((tab, index) => {
          const isFocused = selectedIndex === index;

          return (
            <Pressable
              key={tab.name}
              onPress={() => onSelect(index)}
              className="items-center justify-center flex-1 py-1"
            >
              {/* Active Pill Indicator for Icon */}
              <View className={cn(
                "px-5 py-1 rounded-2xl items-center justify-center mb-1",
                isFocused ? "bg-primary/10" : "bg-transparent"
              )}>
                <Icon
                  name={tab.icon as any}
                  size={22}
                  className={isFocused ? "text-primary" : "text-on-surface-variant/80"}
                />
              </View>
              {/* Text Label */}
              <Text
                className={cn(
                  "text-[10px] font-semibold tracking-wide",
                  isFocused ? "text-primary font-bold" : "text-on-surface-variant/70"
                )}
              >
                {tab.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
