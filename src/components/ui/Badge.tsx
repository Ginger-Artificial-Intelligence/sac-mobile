import { View, ViewProps } from "react-native";
import { cn } from "../../lib/utils";
import { Text } from "./Text";

export interface BadgeProps extends ViewProps {
  label: string | number;
  variant?: "primary" | "secondary" | "error" | "surface";
  className?: string;
}

export function Badge({ label, variant = "primary", className, ...props }: BadgeProps) {
  const variantClasses = {
    primary: "bg-primary-container",
    secondary: "bg-secondary-container",
    error: "bg-error",
    surface: "bg-surface-container",
  };
  
  const textVariantClasses = {
    primary: "text-on-primary-container",
    secondary: "text-on-secondary-container",
    error: "text-on-error",
    surface: "text-on-surface-variant",
  };

  return (
    <View
      className={cn(
        "px-2 py-0.5 rounded-full self-start flex-row items-center justify-center min-w-[20px]",
        variantClasses[variant],
        className
      )}
      {...props}
    >
      <Text className={cn("font-label-md text-center leading-none", textVariantClasses[variant])}>
        {label}
      </Text>
    </View>
  );
}
