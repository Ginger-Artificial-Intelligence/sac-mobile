import { View, Pressable, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import PagerView from "react-native-pager-view";
import { useRef, useEffect, useState } from "react";
import { BottomTabBar } from "../components/ui/BottomTabBar";
import { TopAppBar } from "../components/ui/TopAppBar";
import { Icon } from "../components/ui/Icon";
import { Text } from "../components/ui/Text";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeDropdown } from "../components/ui/NativeDropdown";
import { useThemeStore } from "../store/themeStore";

import DashboardScreen from "../screens/index";
import ContactsScreen from "../screens/contacts";
import InboxScreen from "../screens/inbox";
import ProfileScreen from "../screens/profile";
import { useSyncStore } from "../store/syncStore";

const TABS = ["chats", "contacts", "dashboard", "profile"];

export default function MainAppContainer() {
  const { tab } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const pagerRef = useRef<PagerView>(null);
  const isDark = useThemeStore((state) => state.isDark);
  const colors = useThemeStore((state) => state.colors);
  
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showInboxMenu, setShowInboxMenu] = useState(false);

  // Sync incoming URL param to PagerView
  useEffect(() => {
    if (tab && typeof tab === 'string') {
      const idx = TABS.indexOf(tab);
      if (idx !== -1 && idx !== selectedIndex) {
        setSelectedIndex(idx);
        pagerRef.current?.setPage(idx);
      }
    }
  }, [tab]);

  const onPageSelected = (e: any) => {
    const position = e.nativeEvent.position;
    if (position !== selectedIndex) {
      setSelectedIndex(position);
      router.setParams({ tab: TABS[position] });
    }
  };

  const handleTabSelect = (index: number) => {
    setSelectedIndex(index);
    pagerRef.current?.setPage(index);
    router.setParams({ tab: TABS[index] });
  };

  const selectedIds = useSyncStore((state) => state.selectedChatIds);
  const clearSelection = useSyncStore((state) => state.clearSelection);
  const bulkSetStarred = useSyncStore((state) => state.bulkSetStarred);
  const bulkSetPinned = useSyncStore((state) => state.bulkSetPinned);

  // Configure TopAppBar based on current tab
  const getHeaderProps = () => {
    switch (selectedIndex) {
      case 0:
        if (selectedIds.size > 0) {
          return {
            title: `${selectedIds.size} selected`,
            hideMenu: false,
            menuIcon: "close",
            onMenuPress: clearSelection,
            rightAction: (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20, marginRight: 8 }}>
                <Pressable
                  onPress={() => bulkSetStarred(Array.from(selectedIds), true)}
                  style={({ pressed }) => [
                    {
                      padding: 6,
                      borderRadius: 20,
                      opacity: pressed ? 0.6 : 1,
                      transform: [{ scale: pressed ? 0.90 : 1 }],
                      backgroundColor: pressed ? (isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 50, 107, 0.08)') : 'transparent',
                    }
                  ]}
                >
                  <Icon name="star-outline" size={26} color={colors.onSurfaceVariant} />
                </Pressable>

                <Pressable
                  onPress={() => bulkSetPinned(Array.from(selectedIds), true)}
                  style={({ pressed }) => [
                    {
                      padding: 6,
                      borderRadius: 20,
                      opacity: pressed ? 0.6 : 1,
                      transform: [{ scale: pressed ? 0.90 : 1 }],
                      backgroundColor: pressed ? (isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 50, 107, 0.08)') : 'transparent',
                    }
                  ]}
                >
                  <Icon name="push-pin" size={26} color={colors.onSurfaceVariant} />
                </Pressable>

                <Pressable
                  onPress={() => {
                    const Alert = require("react-native").Alert;
                    Alert.alert('Mute', `Mute ${selectedIds.size} chats? (feature coming soon)`, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Mute', onPress: () => clearSelection() },
                    ]);
                  }}
                  style={({ pressed }) => [
                    {
                      padding: 6,
                      borderRadius: 20,
                      opacity: pressed ? 0.6 : 1,
                      transform: [{ scale: pressed ? 0.90 : 1 }],
                      backgroundColor: pressed ? (isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 50, 107, 0.08)') : 'transparent',
                    }
                  ]}
                >
                  <Icon name="notifications-off" size={26} color={colors.onSurfaceVariant} />
                </Pressable>
              </View>
            )
          };
        }
        return {
          title: "SAC CRM",
          hideMenu: true,
          largeTitle: true,
          rightAction: (
            <NativeDropdown
              expanded={showInboxMenu}
              onDismissRequest={() => setShowInboxMenu(false)}
              onRequestOpen={() => setShowInboxMenu(true)}
              style={{ width: 32, height: 32 }}
              trigger={
                <View className="p-1 rounded-full active:opacity-70 w-full h-full justify-center items-center">
                  <Icon name="more-vert" size={24} color={colors.onSurfaceVariant} />
                </View>
              }
              actions={[
                { label: "New chat", onClick: () => {} },
                { label: "Add contact", onClick: () => {} },
                { 
                  label: "Sync Filters", 
                  icon: "sync",
                  onClick: async () => {
                    try {
                      Alert.alert("Syncing", "Refetching filter options and template libraries...");
                      await useSyncStore.getState().fetchAndCacheFilterOptions();
                      Alert.alert("Success", "Filters and templates synced successfully!");
                    } catch (e) {
                      Alert.alert("Error", "Failed to sync filters.");
                    }
                  }
                },
              ]}
            />
          )
        };
      case 1:
        return { title: "Contacts", hideMenu: true };
      case 2:
        return { title: "Dashboard", hideMenu: true };
      case 3:
        return { title: "Profile", hideMenu: true };
      default:
        return { title: "SAC Crm", hideMenu: true };
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <TopAppBar {...getHeaderProps()} />

      <PagerView
        ref={pagerRef}
        style={{ flex: 1 }}
        initialPage={0}
        onPageSelected={onPageSelected}
      >
        <View key="0" className="flex-1"><InboxScreen /></View>
        <View key="1" className="flex-1"><ContactsScreen /></View>
        <View key="2" className="flex-1"><DashboardScreen /></View>
        <View key="3" className="flex-1"><ProfileScreen /></View>
      </PagerView>
      <BottomTabBar selectedIndex={selectedIndex} onSelect={handleTabSelect} />
    </View>
  );
}
