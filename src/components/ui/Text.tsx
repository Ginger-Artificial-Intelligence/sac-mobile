import { Text as RNText, TextProps as RNTextProps } from "react-native";
import { cn } from "../../lib/utils";
import { useThemeStore } from "../../store/themeStore";

export interface TextProps extends RNTextProps {
  className?: string;
}

export function Text({ className, style, ...props }: TextProps) {
  const colors = useThemeStore((state) => state.colors);

  return (
    <RNText
      style={[{ color: colors.onSurface }, style]}
      className={cn("font-body-md", className)}
      {...props}
    />
  );
}
