import { MaterialIcons } from "@expo/vector-icons";
import { OpaqueColorValue, StyleProp, TextStyle } from "react-native";

export interface IconProps {
  name: keyof typeof MaterialIcons.glyphMap;
  size?: number;
  color?: string | OpaqueColorValue;
  className?: string;
  style?: StyleProp<TextStyle>;
}

export function Icon({ name, size = 24, color, className, style }: IconProps) {
  return (
    <MaterialIcons
      name={name}
      size={size}
      color={color}
      className={className}
      style={style}
    />
  );
}
