import { View, LayoutChangeEvent } from "react-native";
import { useEffect, useState } from "react";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  useReducedMotion,
  SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "./Icon";
import { Text } from "./Text";
import { useThemeStore } from "../../store/themeStore";
import { HapticPressable } from "./HapticPressable";

interface BottomTabBarProps {
  selectedIndex: number;
  onSelect: (index: number) => void;
  pagePosition?: SharedValue<number>;
}

const TABS = [
  { name: "Chats", icon: "chat" },
  { name: "Contacts", icon: "contacts" },
  { name: "Dashboard", icon: "dashboard" },
  { name: "Profile", icon: "person" },
] as const;

const SPRING = {
  damping: 22,
  stiffness: 260,
  mass: 0.7,
};

// Material 3 navigation bar: a docked bar with an icon in a tinted pill and a label under it
const BAR_HEIGHT = 68;
const PILL_WIDTH = 60;
const PILL_HEIGHT = 32;
const PILL_TOP = 9;

export function BottomTabBar({
  selectedIndex,
  onSelect,
  pagePosition,
}: BottomTabBarProps) {
  const colors = useThemeStore((state) => state.colors);
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  const [contentWidth, setContentWidth] = useState(0);
  const indicatorX = useSharedValue(0);
  const tabWidth = contentWidth > 0 ? contentWidth / TABS.length : 0;

  useEffect(() => {
    if (!tabWidth || pagePosition) return;
    const target = selectedIndex * tabWidth + (tabWidth - PILL_WIDTH) / 2;
    indicatorX.value = reduceMotion ? target : withSpring(target, SPRING);
  }, [selectedIndex, tabWidth, pagePosition]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    setContentWidth(width);
    const widthPerTab = width / TABS.length;
    const index = pagePosition ? pagePosition.value : selectedIndex;
    indicatorX.value = index * widthPerTab + (widthPerTab - PILL_WIDTH) / 2;
  };

  const indicatorAnimatedStyle = useAnimatedStyle(() => {
    if (!tabWidth) return { transform: [{ translateX: 0 }] };
    if (pagePosition) {
      return { transform: [{ translateX: pagePosition.value * tabWidth + (tabWidth - PILL_WIDTH) / 2 }] };
    }
    return { transform: [{ translateX: indicatorX.value }] };
  });

  return (
    <View
      className="absolute bottom-0 left-0 right-0 z-50"
      style={{
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.divider,
        paddingBottom: insets.bottom,
      }}
    >
      <View onLayout={handleLayout} className="flex-row" style={{ height: BAR_HEIGHT }}>
        {contentWidth > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                top: PILL_TOP,
                width: PILL_WIDTH,
                height: PILL_HEIGHT,
                borderRadius: PILL_HEIGHT / 2,
                backgroundColor: colors.primaryTint,
              },
              indicatorAnimatedStyle,
            ]}
          />
        )}

        {TABS.map((tab, index) => {
          const focused = selectedIndex === index;
          return (
            <HapticPressable
              key={tab.name}
              hapticType="selection"
              onPress={() => onSelect(index)}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={tab.name}
              className="flex-1 items-center"
              style={{ zIndex: 2, paddingTop: PILL_TOP }}
            >
              <View style={{ width: PILL_WIDTH, height: PILL_HEIGHT, alignItems: "center", justifyContent: "center" }}>
                <Icon name={tab.icon as any} size={22} color={focused ? colors.primary : colors.outline} />
              </View>
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 12,
                  lineHeight: 16,
                  marginTop: 3,
                  fontWeight: focused ? "700" : "500",
                  color: focused ? colors.onSurface : colors.outline,
                }}
              >
                {tab.name}
              </Text>
            </HapticPressable>
          );
        })}
      </View>
    </View>
  );
}
