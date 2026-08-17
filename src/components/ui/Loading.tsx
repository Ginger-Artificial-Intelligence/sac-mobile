import { useEffect, useRef } from "react";
import { View, Animated, Easing } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { Icon } from "./Icon";

type MaterialIconName = keyof typeof MaterialIcons.glyphMap;

interface LoadingSpinnerProps {
  /** Size of the icon in dp */
  size?: number;
  /** Override icon color */
  color?: string;
  /** Material symbol name to spin */
  iconName?: MaterialIconName;
}

/**
 * A smooth, indefinitely-spinning icon loader.
 * Uses react-native Animated to avoid Hermes issues with CSS animations.
 */
export function LoadingSpinner({
  size = 28,
  color = "#00326b",
  iconName = "sync",
}: LoadingSpinnerProps) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    anim.start();
    return () => anim.stop();
  }, []);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <Icon name={iconName} size={size} color={color} />
    </Animated.View>
  );
}

interface LoadingOverlayProps {
  message?: string;
}

/**
 * Full-screen translucent loading overlay with a centered spinner.
 */
export function LoadingOverlay({ message }: LoadingOverlayProps) {
  const Text = require("./Text").Text;

  return (
    <View
      style={{
        position: "absolute",
        inset: 0,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 999,
        backgroundColor: "rgba(0,0,0,0.25)",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        style={{
          backgroundColor: "#ffffff",
          borderRadius: 20,
          padding: 28,
          alignItems: "center",
          gap: 14,
          minWidth: 140,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.12,
          shadowRadius: 12,
          elevation: 8,
        }}
      >
        <LoadingSpinner size={36} />
        {message ? (
          <Text style={{ color: "#0b1c30", fontSize: 14, fontWeight: "500" }}>
            {message}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
