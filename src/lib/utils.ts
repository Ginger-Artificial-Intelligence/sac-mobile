import { clsx, type ClassValue } from "clsx";
import * as Haptics from 'expo-haptics';
import { Platform } from "react-native";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type HapticTopic =
  | "light"
  | "medium"
  | "heavy"
  | "rigid"
  | "soft"
  | "success"
  | "error"
  | "warning"
  | "selection";

export const hapticFeedback = async (
  topic: HapticTopic
): Promise<void> => {
  try {
    // Android
    if (Platform.OS === "android") {
      switch (topic) {
        case "light":
          await Haptics.performAndroidHapticsAsync(
            Haptics.AndroidHaptics.Virtual_Key
          );
          return;

        case "medium":
          await Haptics.performAndroidHapticsAsync(
            Haptics.AndroidHaptics.Keyboard_Tap
          );
          return;

        case "heavy":
          await Haptics.performAndroidHapticsAsync(
            Haptics.AndroidHaptics.Long_Press
          );
          return;

        case "rigid":
          await Haptics.performAndroidHapticsAsync(
            Haptics.AndroidHaptics.Context_Click
          );
          return;

        case "soft":
          await Haptics.performAndroidHapticsAsync(
            Haptics.AndroidHaptics.Segment_Frequent_Tick
          );
          return;

        case "selection":
          await Haptics.performAndroidHapticsAsync(
            Haptics.AndroidHaptics.Segment_Tick
          );
          return;

        case "success":
          await Haptics.performAndroidHapticsAsync(
            Haptics.AndroidHaptics.Confirm
          );
          return;

        case "error":
        case "warning":
          await Haptics.performAndroidHapticsAsync(
            Haptics.AndroidHaptics.Reject
          );
          return;
      }
    }

    // iOS
    switch (topic) {
      case "light":
        await Haptics.impactAsync(
          Haptics.ImpactFeedbackStyle.Light
        );
        break;

      case "medium":
        await Haptics.impactAsync(
          Haptics.ImpactFeedbackStyle.Medium
        );
        break;

      case "heavy":
        await Haptics.impactAsync(
          Haptics.ImpactFeedbackStyle.Heavy
        );
        break;

      case "rigid":
        await Haptics.impactAsync(
          Haptics.ImpactFeedbackStyle.Rigid
        );
        break;

      case "soft":
        await Haptics.impactAsync(
          Haptics.ImpactFeedbackStyle.Soft
        );
        break;

      case "selection":
        await Haptics.selectionAsync();
        break;

      case "success":
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success
        );
        break;

      case "error":
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Error
        );
        break;

      case "warning":
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Warning
        );
        break;
    }
  } catch {
    // Haptics are optional. Never let them break UI interactions.
  }
};