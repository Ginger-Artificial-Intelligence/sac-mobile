import { View, ViewProps } from "react-native";
import { cn } from "../../lib/utils";
import { useThemeStore } from "../../store/themeStore";

export interface CardProps extends ViewProps {
  className?: string;
}

export function Card({ className, style, ...props }: CardProps) {
  const colors = useThemeStore((state) => state.colors);

  return (
    <View
      style={[
        {
          backgroundColor: colors.surfaceContainerLow,
        },
        style,
      ]}
      className={cn(
        "rounded-2xl p-4",
        className
      )}
      {...props}
    />
  );
}
