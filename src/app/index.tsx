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
import { useAfterTransition } from "../hooks/useAfterTransition";
import { useNewContactSheet } from "../store/newContactStore";
import { useShellNav } from "../store/shellNavStore";

import { useSharedValue } from "react-native-reanimated";

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
  const [isStarPressed, setIsStarPressed] = useState(false);
  const [isPinPressed, setIsPinPressed] = useState(false);
  const [isMutePressed, setIsMutePressed] = useState(false);

  const pagePosition = useSharedValue(0);

  // The URL `tab` param is only a one-shot request to switch tabs (deep link, or another screen such
  // as the inbox FAB asking for Contacts). Swiping/tapping tabs must not touch it: every setParams
  // updates the navigation state and re-renders this screen. Clear it once handled so the same
  // request works again later.
  useEffect(() => {
    if (tab && typeof tab === 'string') {
      const idx = TABS.indexOf(tab);
      if (idx !== -1 && idx !== selectedIndex) {
        setSelectedIndex(idx);
        pagerRef.current?.setPage(idx);
      }
      router.setParams({ tab: undefined });
    }
  }, [tab]);

  const onPageSelected = (e: any) => {
    const position = e.nativeEvent.position;
    if (position !== selectedIndex) {
      setSelectedIndex(position);
    }
  };

  // pagePosition is driven by the pager's own scroll events (onPageScroll), so the pill follows the
  // real page motion. Setting it here as well made it jump to the target, then snap back and re-slide.
  const handleTabSelect = (index: number) => {
    setSelectedIndex(index);
    pagerRef.current?.setPage(index);
  };

  // Another tab (the dashboard) asked to show the inbox with a filter: switch to the Chats tab
  const inboxNonce = useShellNav((s) => s.inboxNonce);
  useEffect(() => {
    if (inboxNonce > 0) handleTabSelect(0);
  }, [inboxNonce]);

  // Mount the three off-screen tabs after the screen has finished appearing, so the inbox gets
  // the whole first frame instead of competing with Contacts/Dashboard/Profile.
  const otherTabsReady = useAfterTransition();

  const userName = useSyncStore((state) => state.userName);
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
                  onPress={() => {
                    const ids = Array.from(selectedIds);
                    const chats = useSyncStore.getState().chats;
                    bulkSetStarred(ids, !ids.every((id) => chats.find((c) => c.id === id)?.isStarred));
                  }}
                  onPressIn={() => setIsStarPressed(true)}
                  onPressOut={() => setIsStarPressed(false)}
                  style={{
                    padding: 6,
                    borderRadius: 20,
                    opacity: isStarPressed ? 0.6 : 1,
                    transform: [{ scale: isStarPressed ? 0.90 : 1 }],
                    backgroundColor: isStarPressed ? (isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 50, 107, 0.08)') : 'transparent',
                  }}
                >
                  <Icon name="star-outline" size={26} color={colors.onSurfaceVariant} />
                </Pressable>

                <Pressable
                  onPress={() => {
                    const ids = Array.from(selectedIds);
                    const chats = useSyncStore.getState().chats;
                    bulkSetPinned(ids, !ids.every((id) => chats.find((c) => c.id === id)?.pinned));
                  }}
                  onPressIn={() => setIsPinPressed(true)}
                  onPressOut={() => setIsPinPressed(false)}
                  style={{
                    padding: 6,
                    borderRadius: 20,
                    opacity: isPinPressed ? 0.6 : 1,
                    transform: [{ scale: isPinPressed ? 0.90 : 1 }],
                    backgroundColor: isPinPressed ? (isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 50, 107, 0.08)') : 'transparent',
                  }}
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
                  onPressIn={() => setIsMutePressed(true)}
                  onPressOut={() => setIsMutePressed(false)}
                  style={{
                    padding: 6,
                    borderRadius: 20,
                    opacity: isMutePressed ? 0.6 : 1,
                    transform: [{ scale: isMutePressed ? 0.90 : 1 }],
                    backgroundColor: isMutePressed ? (isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 50, 107, 0.08)') : 'transparent',
                  }}
                >
                  <Icon name="notifications-off" size={26} color={colors.onSurfaceVariant} />
                </Pressable>
              </View>
            )
          };
        }
        return {
          title: userName || "SAC CRM",
          hideMenu: true,
          largeTitle: true,
          rightAction: (
            <NativeDropdown
              expanded={showInboxMenu}

              onDismissRequest={() => setShowInboxMenu(false)}
              onRequestOpen={() => setShowInboxMenu(true)}
              style={{ width: 44, height: 44 }}
              trigger={
                <View style={{ width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' }}>
                  <Icon name="more-vert" size={24} color={colors.onSurfaceVariant} />
                </View>
              }
              actions={[
                {
                  label: "Full Sync Server Data",
                  icon: "cloud-sync",
                  onClick: async () => {
                    try {
                      Alert.alert("Full Sync", "Starting full background sync with server...");
                      await useSyncStore.getState().syncWithBackend();
                    } catch (e) {
                      Alert.alert("Sync Error", "Failed to sync data with server.");
                    }
                  }
                },
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
                { label: "New chat", icon: "chat", onClick: () => useNewContactSheet.getState().open('chat') },
                { label: "Add contact", icon: "person-add", onClick: () => useNewContactSheet.getState().open('contact') },
              ]}
            />
          )
        };
      case 1:
        return {
          title: "Contacts",
          hideMenu: true,
          rightAction: (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Pressable
                onPress={() => useShellNav.getState().requestImport()}
                accessibilityLabel="Import contacts"
                style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}
              >
                <Icon name="upload" size={24} color={colors.onSurfaceVariant} />
              </Pressable>
              <Pressable
                onPress={() => useNewContactSheet.getState().open('contact')}
                accessibilityLabel="Add contact"
                style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}
              >
                <Icon name="person-add" size={24} color={colors.primary} />
              </Pressable>
            </View>
          ),
        };
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
        onPageScroll={(e) => {
          pagePosition.value = e.nativeEvent.position + e.nativeEvent.offset;
        }}
      >
        <View key="0" className="flex-1"><InboxScreen /></View>
        <View key="1" className="flex-1">{otherTabsReady ? <ContactsScreen /> : null}</View>
        <View key="2" className="flex-1">{otherTabsReady ? <DashboardScreen /> : null}</View>
        <View key="3" className="flex-1">{otherTabsReady ? <ProfileScreen /> : null}</View>
      </PagerView>
      <BottomTabBar selectedIndex={selectedIndex} onSelect={handleTabSelect} pagePosition={pagePosition} />
    </View>
  );
}
