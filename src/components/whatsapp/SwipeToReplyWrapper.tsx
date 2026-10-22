import React from "react";
import { View, StyleSheet } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  Extrapolation,
  runOnJS,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Icon } from "../ui/Icon";
import { useThemeStore } from "../../store/themeStore";

interface SwipeToReplyWrapperProps {
  children: React.ReactNode;
  onSwipeReply: () => void;
  isOutgoing?: boolean;
  disabled?: boolean;
}

const TRIGGER_THRESHOLD = 45;
const MAX_TRANSLATION = 75;

export const SwipeToReplyWrapper: React.FC<SwipeToReplyWrapperProps> = React.memo(
  ({ children, onSwipeReply, isOutgoing = false, disabled = false }) => {
    const isDark = useThemeStore((state) => state.isDark);
    const colors = useThemeStore((state) => state.colors);

    const translateX = useSharedValue(0);
    const hasTriggeredHaptic = useSharedValue(false);

    const triggerHaptic = () => {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch (_) {}
    };

    const handleReply = () => {
      onSwipeReply();
    };

    const panGesture = Gesture.Pan()
      .enabled(!disabled)
      // If outgoing, activate on dragging left (x <= -10); if incoming, drag right (x >= 10)
      .activeOffsetX(isOutgoing ? [-10, 1000] : [10, 1000])
      .failOffsetY([-15, 15]) // Allow smooth vertical list scroll
      .onUpdate((event) => {
        const isCorrectDirection = isOutgoing
          ? event.translationX < 0
          : event.translationX > 0;

        if (isCorrectDirection) {
          const progress = Math.abs(event.translationX);
          const damped = Math.min(progress * 0.65, MAX_TRANSLATION);
          translateX.value = isOutgoing ? -damped : damped;

          if (damped >= TRIGGER_THRESHOLD && !hasTriggeredHaptic.value) {
            hasTriggeredHaptic.value = true;
            runOnJS(triggerHaptic)();
          } else if (damped < TRIGGER_THRESHOLD && hasTriggeredHaptic.value) {
            hasTriggeredHaptic.value = false;
          }
        }
      })
      .onEnd(() => {
        if (Math.abs(translateX.value) >= TRIGGER_THRESHOLD) {
          runOnJS(handleReply)();
        }
        hasTriggeredHaptic.value = false;
        translateX.value = withSpring(0, {
          damping: 22,
          stiffness: 250,
          mass: 0.8,
        });
      });

    const animatedBubbleStyle = useAnimatedStyle(() => ({
      transform: [{ translateX: translateX.value }],
    }));

    const animatedBadgeStyle = useAnimatedStyle(() => {
      const distance = Math.abs(translateX.value);
      const scale = interpolate(
        distance,
        [0, 15, TRIGGER_THRESHOLD],
        [0.3, 0.6, 1.1],
        Extrapolation.CLAMP
      );
      const opacity = interpolate(
        distance,
        [0, 15, TRIGGER_THRESHOLD],
        [0, 0.5, 1],
        Extrapolation.CLAMP
      );
      const rotateDeg = interpolate(
        distance,
        [0, TRIGGER_THRESHOLD],
        [isOutgoing ? 30 : -30, 0],
        Extrapolation.CLAMP
      );

      return {
        opacity,
        transform: [{ scale }, { rotate: `${rotateDeg}deg` }],
      };
    });

    return (
      <View style={styles.container}>
        {/* Reply Action Badge Behind */}
        <Animated.View
          style={[
            styles.replyBadge,
            isOutgoing ? { right: 12 } : { left: 12 },
            {
              backgroundColor: isDark
                ? "rgba(171, 199, 255, 0.25)"
                : colors.primary,
            },
            animatedBadgeStyle,
          ]}
        >
          <Icon
            name="reply"
            size={18}
            color={isDark ? colors.primary : "#ffffff"}
            style={isOutgoing ? { transform: [{ scaleX: -1 }] } : undefined}
          />
        </Animated.View>

        {/* Swiping Bubble */}
        <GestureDetector gesture={panGesture}>
          <Animated.View style={[styles.bubbleWrapper, animatedBubbleStyle]}>
            {children}
          </Animated.View>
        </GestureDetector>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    position: "relative",
    width: "100%",
    justifyContent: "center",
  },
  replyBadge: {
    position: "absolute",
    top: "50%",
    marginTop: -17,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 0,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.5,
  },
  bubbleWrapper: {
    width: "100%",
    zIndex: 1,
  },
});
