import React, { useEffect, useRef } from "react";
import { View, Image, StatusBar, Platform } from "react-native";
import { useRouter } from "expo-router";
import { Text } from "../components/ui/Text";
import { Icon } from "../components/ui/Icon";
import { useSyncStore } from "../store/syncStore";
import { useThemeStore } from "../store/themeStore";
import { IMAGE_PATHS } from "../constants/imagePaths";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from "react-native-reanimated";

export default function SyncScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDark = useThemeStore((state) => state.isDark);
  const colors = useThemeStore((state) => state.colors);

  const isAuthenticated = useSyncStore((state) => state.isAuthenticated);
  const isSyncing = useSyncStore((state) => state.isSyncing);
  const isInitialSync = useSyncStore((state) => state.isInitialSync);
  const syncProgress = useSyncStore((state) => state.syncProgress);
  const syncWithBackend = useSyncStore((state) => state.syncWithBackend);
  const userEmail = useSyncStore((state) => state.userEmail);
  const userName = useSyncStore((state) => state.userName);

  const pulseScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.4);
  const progressWidth = useSharedValue(5);

  const hasStartedRef = useRef(false);

  // Kick off sync on mount if not already syncing
  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }

    if (!hasStartedRef.current && !isSyncing) {
      hasStartedRef.current = true;
      syncWithBackend();
    }
  }, [isAuthenticated, isSyncing, syncWithBackend, router]);

  // Navigate to main dashboard when sync completes
  useEffect(() => {
    if (!isSyncing && !isInitialSync && syncProgress?.percentage === 100) {
      const timer = setTimeout(() => {
        router.replace("/");
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [isSyncing, isInitialSync, syncProgress, router]);

  // Pulse animation for logo
  useEffect(() => {
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.06, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.97, { duration: 1200, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.85, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.3, { duration: 1200, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  // Update animated progress bar
  const currentPct = syncProgress?.percentage ?? (isSyncing ? 20 : 100);
  useEffect(() => {
    progressWidth.value = withTiming(Math.max(5, Math.min(100, currentPct)), {
      duration: 400,
      easing: Easing.out(Easing.cubic),
    });
  }, [currentPct]);

  const logoAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const glowAnimatedStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const barAnimatedStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%`,
  }));

  const stepLabels = [
    { title: "Chats", icon: "chat", done: (syncProgress?.step ?? 1) > 1 || currentPct >= 45 },
    { title: "Contacts", icon: "contacts", done: (syncProgress?.step ?? 1) > 2 || currentPct >= 55 },
    { title: "Messages", icon: "forum", done: (syncProgress?.step ?? 1) > 3 || currentPct >= 92 },
    { title: "Templates", icon: "dashboard-customize", done: currentPct >= 98 },
  ];

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: isDark ? "#0b131e" : "#00326b",
        paddingTop: insets.top + 30,
        paddingBottom: insets.bottom + 24,
        paddingHorizontal: 28,
        justifyContent: "space-between",
      }}
    >
      <StatusBar barStyle="light-content" />

      {/* Top Welcome info */}
      <View className="items-center mt-6">
        <Text style={{ color: "rgba(255, 255, 255, 0.7)", fontSize: 13, fontWeight: "600", textTransform: "uppercase", letterSpacing: 1.5 }}>
          Setting up your CRM
        </Text>
        <Text style={{ color: "#ffffff", fontSize: 22, fontWeight: "700", marginTop: 4, textAlign: "center" }}>
          {userName ? `Welcome, ${userName}` : "Synchronizing Workspace"}
        </Text>
      </View>

      {/* Center Logo with Animated Glow & Pulse */}
      <View className="items-center justify-center my-8">
        <Animated.View
          style={[
            {
              position: "absolute",
              width: 180,
              height: 180,
              borderRadius: 90,
              backgroundColor: isDark ? "rgba(83, 189, 235, 0.22)" : "rgba(255, 255, 255, 0.2)",
            },
            glowAnimatedStyle,
          ]}
        />
        <Animated.View
          style={[
            {
              width: 110,
              height: 110,
              borderRadius: 28,
              backgroundColor: "#ffffff",
              alignItems: "center",
              justifyContent: "center",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.35,
              shadowRadius: 20,
              elevation: 12,
              padding: 12,
            },
            logoAnimatedStyle,
          ]}
        >
          <Image
            source={IMAGE_PATHS.app_logo}
            style={{ width: 84, height: 84 }}
            resizeMode="contain"
          />
        </Animated.View>

        {/* Live Step Label */}
        <View className="mt-8 items-center px-4">
          <Text style={{ color: "#ffffff", fontSize: 16, fontWeight: "600", textAlign: "center" }}>
            {syncProgress?.label || (isSyncing ? "Syncing initial data…" : "Finishing up…")}
          </Text>
          <Text style={{ color: "rgba(255, 255, 255, 0.65)", fontSize: 12.5, marginTop: 4, textAlign: "center" }}>
            {syncProgress?.chatsSynced
              ? `${syncProgress.chatsSynced} chats cached locally`
              : "Connecting and fetching recent conversations"}
          </Text>
        </View>
      </View>

      {/* Bottom Progress Card */}
      <View
        style={{
          backgroundColor: isDark ? "rgba(18, 29, 43, 0.85)" : "rgba(255, 255, 255, 0.12)",
          borderRadius: 24,
          padding: 20,
          borderWidth: 1,
          borderColor: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.2)",
        }}
      >
        {/* Step Icons row */}
        <View className="flex-row justify-around items-center mb-5">
          {stepLabels.map((s, idx) => (
            <View key={s.title} className="items-center">
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  backgroundColor: s.done
                    ? "#00a884"
                    : isDark
                    ? "rgba(255, 255, 255, 0.1)"
                    : "rgba(255, 255, 255, 0.2)",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 4,
                }}
              >
                <Icon
                  name={s.done ? "check" : (s.icon as any)}
                  size={18}
                  color={s.done ? "#ffffff" : "rgba(255, 255, 255, 0.75)"}
                />
              </View>
              <Text
                style={{
                  fontSize: 10.5,
                  fontWeight: "600",
                  color: s.done ? "#53bdeb" : "rgba(255, 255, 255, 0.6)",
                }}
              >
                {s.title}
              </Text>
            </View>
          ))}
        </View>

        {/* Progress Bar */}
        <View
          style={{
            height: 8,
            borderRadius: 4,
            backgroundColor: isDark ? "rgba(0, 0, 0, 0.35)" : "rgba(0, 0, 0, 0.2)",
            overflow: "hidden",
            marginBottom: 10,
          }}
        >
          <Animated.View
            style={[
              {
                height: "100%",
                borderRadius: 4,
                backgroundColor: currentPct === 100 ? "#00a884" : "#53bdeb",
              },
              barAnimatedStyle,
            ]}
          />
        </View>

        {/* Footer Percentage & Hint */}
        <View className="flex-row justify-between items-center">
          <Text style={{ color: "rgba(255, 255, 255, 0.7)", fontSize: 11.5 }}>
            {currentPct === 100 ? "Sync completed" : "Initial synchronization"}
          </Text>
          <Text style={{ color: "#ffffff", fontSize: 12, fontWeight: "700" }}>
            {currentPct}%
          </Text>
        </View>
      </View>
    </View>
  );
}
