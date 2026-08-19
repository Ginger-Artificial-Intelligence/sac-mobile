import { View, LayoutChangeEvent } from "react-native";
import { useEffect, useState } from "react";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";

import { Icon } from "./Icon";
import { useThemeStore } from "../../store/themeStore";
import { HapticPressable } from "./HapticPressable";

interface BottomTabBarProps {
  selectedIndex: number;
  onSelect: (index: number) => void;
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

const BAR_PADDING = 12;

const PILL_WIDTH = 58;
const PILL_HEIGHT = 40;

export function BottomTabBar({
  selectedIndex,
  onSelect,
}: BottomTabBarProps) {
  const isDark = useThemeStore((state) => state.isDark);
  const colors = useThemeStore((state) => state.colors);

  const [contentWidth, setContentWidth] = useState(0);

  const indicatorX = useSharedValue(0);

  const tabWidth =
    contentWidth > 0
      ? contentWidth / TABS.length
      : 0;

  useEffect(() => {
    if (!tabWidth) return;

    indicatorX.value = withSpring(
      selectedIndex * tabWidth +
      (tabWidth - PILL_WIDTH) / 2,
      SPRING
    );
  }, [selectedIndex, tabWidth]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;

    setContentWidth(width);

    const widthPerTab = width / TABS.length;

    indicatorX.value =
      selectedIndex * widthPerTab +
      (widthPerTab - PILL_WIDTH) / 2;
  };

  const indicatorAnimatedStyle =
    useAnimatedStyle(() => ({
      transform: [
        {
          translateX: indicatorX.value,
        },
      ],
    }));

  return (
    <View className="absolute bottom-6 left-6 right-6 z-50">
      <View
        className="h-20 rounded-full"
        style={{
          backgroundColor: isDark
            ? "rgba(18, 29, 43, 0.96)"
            : "rgba(255, 255, 255, 0.96)",

          borderWidth: 1,
          borderColor: colors.divider,

          shadowColor: isDark ? "#000" : "#00326b",
          shadowOffset: {
            width: 0,
            height: 6,
          },
          shadowOpacity: isDark ? 0.35 : 0.1,
          shadowRadius: 14,

          elevation: 8,
        }}
      >
        <View
          onLayout={handleLayout}
          className="flex-1 flex-row items-center"
          style={{
            marginHorizontal: BAR_PADDING,
          }}
        >
          {/* ACTIVE PILL */}

          {contentWidth > 0 && (
            <Animated.View
              pointerEvents="none"
              style={[
                {
                  position: "absolute",

                  top: "50%",

                  marginTop: -(PILL_HEIGHT / 2),

                  width: PILL_WIDTH,
                  height: PILL_HEIGHT,

                  borderRadius: PILL_HEIGHT / 2,

                  backgroundColor: isDark
                    ? "rgba(171, 199, 255, 0.16)"
                    : "rgba(0, 50, 107, 0.09)",
                },

                indicatorAnimatedStyle,
              ]}
            />
          )}

          {/* TAB BUTTONS */}

          {TABS.map((tab, index) => {
            const focused =
              selectedIndex === index;

            return (
              <HapticPressable
                key={tab.name}
                hapticType="selection"
                onPress={() => onSelect(index)}
                className="h-full flex-1 items-center justify-center"
                style={{
                  zIndex: 2,
                }}
              >
                <View
                  style={{
                    width: PILL_WIDTH,
                    height: PILL_HEIGHT,

                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon
                    name={tab.icon as any}
                    size={22}
                    color={
                      focused
                        ? colors.primary
                        : colors.outline
                    }
                  />
                </View>
              </HapticPressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}