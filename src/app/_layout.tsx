import { GestureHandlerRootView } from "react-native-gesture-handler";
import "../../global.css";
import { Stack, useSegments, useRouter } from "expo-router";
import { useFonts } from "expo-font";
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from "@expo-google-fonts/plus-jakarta-sans";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from "../store/queryClient";
import { initializeDatabase } from "../db/client";
import { useSyncStore } from "../store/syncStore";
import { useThemeStore } from "../store/themeStore";
import { useColorScheme } from "nativewind";
import { LoadingSpinner } from "../components/ui/Loading";
import SocketManager from "../components/common/SocketManager";

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  const [dbInitialized, setDbInitialized] = useState(false);
  const segments = useSegments();
  const router = useRouter();
  const isAuthenticated = useSyncStore((state) => state.isAuthenticated);
  const isInitialSync = useSyncStore((state) => state.isInitialSync);

  useEffect(() => {
    const init = async () => {
      // Initialize SQLite database at startup
      await initializeDatabase();
      setDbInitialized(true);
    };
    init();
  }, []);

  useEffect(() => {
    if (!dbInitialized || !loaded) return;

    const currentSegment = segments[0];
    const inAuthGroup = currentSegment === 'login';
    const inSyncGroup = currentSegment === 'sync';

    if (!isAuthenticated) {
      if (!inAuthGroup) {
        router.replace('/login');
      }
    } else {
      if (isInitialSync) {
        if (!inSyncGroup) {
          router.replace('/sync');
        }
      } else {
        if (inAuthGroup || inSyncGroup) {
          router.replace('/');
        }
      }
    }
  }, [isAuthenticated, isInitialSync, segments[0], dbInitialized, loaded]);

  const isDark = useThemeStore((state) => state.isDark);
  const themeMode = useThemeStore((state) => state.themeMode);
  const { setColorScheme } = useColorScheme();

  useEffect(() => {
    setColorScheme(isDark ? 'dark' : 'light');
  }, [isDark, setColorScheme]);

  useEffect(() => {
    if ((loaded || error) && dbInitialized) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error, dbInitialized]);

  if ((!loaded && !error) || !dbInitialized) {
    return (
      <View style={{ flex: 1, backgroundColor: isDark ? '#0d1520' : '#00326b', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
        <LoadingSpinner size={48} color={isDark ? '#abc7ff' : '#ffffff'} iconName="sync" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style={isDark ? "light" : "dark"} />
        <QueryClientProvider client={queryClient}>
          <SocketManager />
          <Stack
            screenOptions={{
              headerShown: false,
              animation: 'slide_from_right',
              animationDuration: 200,
              contentStyle: { backgroundColor: isDark ? '#0b121c' : '#efeae2' },
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="login" options={{ headerShown: false }} />
            <Stack.Screen name="sync" options={{ headerShown: false }} />
            <Stack.Screen
              name="chat/[id]"
              options={{
                headerShown: false,
                animation: 'slide_from_right',
                animationDuration: 200,
              }}
            />
          </Stack>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
