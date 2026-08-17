import { View, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import PagerView from "react-native-pager-view";
import { useRef, useEffect, useState } from "react";
import { BottomTabBar } from "../components/ui/BottomTabBar";
import { TopAppBar } from "../components/ui/TopAppBar";
import { Icon } from "../components/ui/Icon";
import { Text } from "../components/ui/Text";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeDropdown } from "../components/ui/NativeDropdown";

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
  const chats = useSyncStore((state) => state.chats);

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
                  onPress={async () => {
                    const API = require("../config/axios").default;
                    const loadChats = useSyncStore.getState().loadChats;
                    const { db } = require('../db/client');
                    const { chats: chatsTable } = require('../db/schema');
                    const { eq } = require('drizzle-orm');
                    for (const id of selectedIds) {
                      const current = chats.find((c: any) => c.id === id);
                      if (current) {
                        const newVal = !current.isStarred;
                        await db.update(chatsTable).set({ isStarred: newVal }).where(eq(chatsTable.id, id));
                        API.patch(`/chats/toggle-chat-star/${id}`).catch(() => {});
                      }
                    }
                    await loadChats();
                    clearSelection();
                  }}
                  style={({ pressed }) => [
                    {
                      padding: 6,
                      borderRadius: 20,
                      opacity: pressed ? 0.6 : 1,
                      transform: [{ scale: pressed ? 0.90 : 1 }],
                      backgroundColor: pressed ? 'rgba(0, 50, 107, 0.08)' : 'transparent',
                    }
                  ]}
                >
                  <Icon name="star-outline" size={26} className="text-on-surface-variant" />
                </Pressable>

                <Pressable
                  onPress={async () => {
                    const API = require("../config/axios").default;
                    const loadChats = useSyncStore.getState().loadChats;
                    const { db } = require('../db/client');
                    const { chats: chatsTable } = require('../db/schema');
                    const { eq } = require('drizzle-orm');
                    for (const id of selectedIds) {
                      const current = chats.find((c: any) => c.id === id);
                      if (current) {
                        const newVal = !current.pinned;
                        await db.update(chatsTable).set({ pinned: newVal }).where(eq(chatsTable.id, id));
                        API.patch(`/chats/toggle-chat-pin/${id}`).catch(() => {});
                      }
                    }
                    await loadChats();
                    clearSelection();
                  }}
                  style={({ pressed }) => [
                    {
                      padding: 6,
                      borderRadius: 20,
                      opacity: pressed ? 0.6 : 1,
                      transform: [{ scale: pressed ? 0.90 : 1 }],
                      backgroundColor: pressed ? 'rgba(0, 50, 107, 0.08)' : 'transparent',
                    }
                  ]}
                >
                  <Icon name="push-pin" size={26} className="text-on-surface-variant" />
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
                      backgroundColor: pressed ? 'rgba(0, 50, 107, 0.08)' : 'transparent',
                    }
                  ]}
                >
                  <Icon name="notifications-off" size={26} className="text-on-surface-variant" />
                </Pressable>
              </View>
            )
          };
        }
        return {
          title: "SAC Crm",
          hideMenu: true,
          largeTitle: true,
          rightAction: (
            <NativeDropdown
              expanded={showInboxMenu}
              onDismissRequest={() => setShowInboxMenu(false)}
              onRequestOpen={() => setShowInboxMenu(true)}
              style={{ width: 32, height: 32 }}
              trigger={
                <View className="p-1 rounded-full active:bg-surface-variant/50 w-full h-full justify-center items-center">
                  <Icon name="more-vert" size={24} className="text-on-surface-variant" />
                </View>
              }
              actions={[
                { label: "New chat", onClick: () => {} },
                { label: "Add contact", onClick: () => {} },
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
    <View className="flex-1 bg-background">
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
