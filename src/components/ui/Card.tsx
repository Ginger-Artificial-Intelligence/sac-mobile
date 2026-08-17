import { View, ViewProps } from "react-native";
import { cn } from "../../lib/utils";

export interface CardProps extends ViewProps {
  className?: string;
}

export function Card({ className, ...props }: CardProps) {
  return (
    <View
      className={cn(
        "bg-surface-container-lowest border border-outline-variant rounded-xl p-4",
        className
      )}
      {...props}
    />
  );
}
