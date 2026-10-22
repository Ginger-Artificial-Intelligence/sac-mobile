import { Pressable, View } from "react-native";
import { Text } from "./Text";
import { Icon } from "./Icon";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeStore } from "../../store/themeStore";
import { useState } from "react";

export interface TopAppBarProps {
  title: string;
  onMenuPress?: () => void;
  rightAction?: React.ReactNode;
  hideMenu?: boolean;
  largeTitle?: boolean;
  menuIcon?: string;
}

export function TopAppBar({ title, onMenuPress, rightAction, hideMenu, largeTitle, menuIcon }: TopAppBarProps) {
  const insets = useSafeAreaInsets();
  const topPadding = Math.max(insets.top, 12);
  const isDark = useThemeStore((state) => state.isDark);
  const colors = useThemeStore((state) => state.colors);
  const [isMenuPressed, setIsMenuPressed] = useState(false);
  
  return (
    <View 
      className="flex-row items-center justify-between px-container-padding"
      style={{ 
        paddingTop: topPadding,
        height: 56 + topPadding,
        backgroundColor: colors.surfaceContainerLowest,
        borderBottomWidth: 1,
        borderBottomColor: colors.divider,
      }}
    >
      <View className="flex-row items-center gap-3 flex-1 mr-4">
        {!hideMenu && (
          <Pressable 
            onPress={onMenuPress}
            onPressIn={() => setIsMenuPressed(true)}
            onPressOut={() => setIsMenuPressed(false)}
            style={{
              padding: 6,
              borderRadius: 20,
              opacity: isMenuPressed ? 0.6 : 1,
              transform: [{ scale: isMenuPressed ? 0.90 : 1 }],
              backgroundColor: isMenuPressed ? (isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 50, 107, 0.08)') : 'transparent',
            }}
          >
            <Icon name={(menuIcon || "menu") as any} size={24} color={colors.onSurfaceVariant} />
          </Pressable>
        )}
        <Text 
          numberOfLines={1} 
          style={{
            fontSize: largeTitle ? 24 : 20,
            fontWeight: largeTitle ? '800' : '600',
            color: largeTitle ? colors.primary : colors.onSurface,
          }}
          className="flex-1"
        >
          {title}
        </Text>
      </View>
      
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', zIndex: 10 }}>
        {rightAction}
      </View>
    </View>
  );
}
