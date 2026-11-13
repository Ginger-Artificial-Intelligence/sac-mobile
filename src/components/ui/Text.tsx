import { StyleSheet, Text as RNText, TextProps as RNTextProps } from "react-native";
import { cn } from "../../lib/utils";
import { useThemeStore } from "../../store/themeStore";

export interface TextProps extends RNTextProps {
  className?: string;
}

// The fonts are loaded in app/_layout.tsx under these exact names. A custom font has one weight per
// file, so the weight asked for in `style` picks the file; without this the phone's own system font
// (whatever the user set it to) is used instead of the app's typeface.
const familyFor = (weight: unknown): string => {
  const n = weight === "bold" ? 700 : weight === "normal" || weight == null ? 400 : Number(weight) || 400;
  if (n >= 700) return "PlusJakartaSans_700Bold";
  if (n >= 600) return "PlusJakartaSans_600SemiBold";
  if (n >= 500) return "PlusJakartaSans_500Medium";
  return "PlusJakartaSans_400Regular";
};

export function Text({ className, style, ...props }: TextProps) {
  const colors = useThemeStore((state) => state.colors);
  const flat = StyleSheet.flatten(style) || {};
  // A weight can also come from a class name (font-bold, font-semibold, font-medium)
  const classWeight = /font-(bold|extrabold|black)/.test(className || "")
    ? 700
    : /font-semibold/.test(className || "")
      ? 600
      : /font-medium/.test(className || "")
        ? 500
        : undefined;

  return (
    <RNText
      style={[{ color: colors.onSurface }, flat, { fontFamily: familyFor(flat.fontWeight ?? classWeight), fontWeight: "normal" }]}
      className={cn(className)}
      {...props}
    />
  );
}
