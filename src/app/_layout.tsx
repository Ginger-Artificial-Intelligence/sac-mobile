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

    if (!isAuthenticated) {
      if (!inAuthGroup) {
        router.replace('/login');
      }
    } else {
      if (inAuthGroup) {
        router.replace('/');
      }
    }
  }, [isAuthenticated, segments[0], dbInitialized, loaded]);

  useEffect(() => {
    if ((loaded || error) && dbInitialized) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error, dbInitialized]);

  if ((!loaded && !error) || !dbInitialized) {
    return (
      <View style={{ flex: 1, backgroundColor: '#eff4ff', alignItems: 'center', justifyContent: 'center' }}>
        <LoadingSpinner size={48} color="#00326b" iconName="sync" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <QueryClientProvider client={queryClient}>
        <SocketManager />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
        </Stack>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
