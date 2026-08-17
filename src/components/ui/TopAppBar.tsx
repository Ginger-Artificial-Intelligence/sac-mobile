import { Pressable, View } from "react-native";
import { Text } from "./Text";
import { Icon } from "./Icon";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
  
  return (
    <View 
      className="bg-surface border-b border-outline-variant flex-row items-center justify-between px-container-padding"
      style={{ 
        paddingTop: topPadding,
        height: 56 + topPadding,
      }}
    >
      <View className="flex-row items-center gap-3 flex-1 mr-4">
        {!hideMenu && (
          <Pressable 
            onPress={onMenuPress}
            style={({ pressed }) => [
              {
                padding: 6,
                borderRadius: 20,
                opacity: pressed ? 0.6 : 1,
                transform: [{ scale: pressed ? 0.90 : 1 }],
                backgroundColor: pressed ? 'rgba(0, 50, 107, 0.08)' : 'transparent',
              }
            ]}
          >
            <Icon name={(menuIcon || "menu") as any} size={24} className="text-on-surface-variant" />
          </Pressable>
        )}
        <Text 
          numberOfLines={1} 
          className={`${largeTitle ? 'text-xl font-black text-on-surface' : 'text-xl font-semibold text-on-surface-variant'} flex-1`}
        >
          {title}
        </Text>
      </View>
      
      <View className="flex flex-row items-center justify-end">
        {rightAction}
      </View>
    </View>
  );
}
