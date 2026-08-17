import { Image, ImageProps, View } from "react-native";
import { cn } from "../../lib/utils";
import { Text } from "./Text";

export interface AvatarProps extends Omit<ImageProps, "source"> {
  source?: ImageProps["source"];
  fallback?: string;
  size?: number;
  className?: string;
}

export function Avatar({ source, fallback, size = 40, className, ...props }: AvatarProps) {
  return (
    <View
      className={cn("overflow-hidden bg-surface-container flex items-center justify-center shrink-0", className)}
      style={{ width: size, height: size, borderRadius: size / 2 }}
    >
      {source ? (
        <Image source={source} style={{ width: size, height: size }} {...props} />
      ) : (
        <Text className="text-on-surface-variant font-medium" style={{ fontSize: size * 0.4 }}>
          {fallback?.charAt(0).toUpperCase()}
        </Text>
      )}
    </View>
  );
}
