import { useState } from "react";
import { Image, ImageProps, View } from "react-native";
import { cn } from "../../lib/utils";
import { Text } from "./Text";
import { useThemeStore } from "../../store/themeStore";

export interface AvatarProps extends Omit<ImageProps, "source"> {
  source?: ImageProps["source"];
  fallback?: string;
  size?: number;
  className?: string;
}

export function Avatar({ source, fallback, size = 40, className, ...props }: AvatarProps) {
  const [hasError, setHasError] = useState(false);
  const colors = useThemeStore((s) => s.colors);

  return (
    <View
      className={cn("overflow-hidden flex items-center justify-center shrink-0", className)}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primaryTint }}
    >
      {source && !hasError ? (
        <Image
          source={source}
          style={{ width: size, height: size }}
          resizeMode="cover"
          onError={() => setHasError(true)}
          {...props}
        />
      ) : (
        <Text style={{ fontSize: size * 0.4, fontWeight: "700", color: colors.primary }}>
          {fallback?.charAt(0).toUpperCase() || "?"}
        </Text>
      )}
    </View>
  );
}
