import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, TextInput, View } from "react-native";
import { Text } from "../ui/Text";
import { Icon } from "../ui/Icon";
import API from "../../config/axios";
import { useThemeStore } from "../../store/themeStore";
import { useSyncStore, type Message } from "../../store/syncStore";
import { normalizeChatMessage } from "../../lib/messageUtils";
import { buildForwardPayload, canForwardMessage, FORWARD_MAX_TARGETS } from "../../lib/forwardMessage";

/** Pick up to five WhatsApp chats and forward the given messages to them (POST /messages/forward) */
export function ForwardSheet({
  messages,
  phoneNumberId,
  onClose,
}: {
  messages: Message[] | null;
  phoneNumberId: string;
  onClose: () => void;
}) {
  const colors = useThemeStore((s) => s.colors);
  const chats = useSyncStore((s) => s.chats);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  const targets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return chats
      .filter((c) => c.channel === "whatsapp" && !c.isGroup && !c.isBlocked && !!c.phoneNumber)
      .filter((c) => !q || c.name.toLowerCase().includes(q) || (c.phoneNumber || "").includes(q))
      .slice(0, 200);
  }, [chats, search]);

  const toggle = (id: string) =>
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= FORWARD_MAX_TARGETS ? cur : [...cur, id]));

  const close = () => {
    setPicked([]);
    setSearch("");
    onClose();
  };

  const send = async () => {
    if (!messages?.length || !picked.length || sending) return;
    const chosen = chats.filter((c) => picked.includes(c.id)).map((c) => ({ _id: c.id, phoneNumber: c.phoneNumber }));
    setSending(true);
    let failed = 0;
    let skipped = 0;
    // oldest first, so they arrive in the order they were written
    for (const m of [...messages].reverse()) {
      const norm = normalizeChatMessage(m);
      if (!canForwardMessage(norm)) {
        skipped++;
        continue;
      }
      try {
        const body = buildForwardPayload(norm, chosen, phoneNumberId);
        const res = await API.post("/messages/forward", body, { params: { phone_number_id: phoneNumberId } });
        if (res.data?.success === false || res.data?.errors?.length) failed++;
      } catch (e) {
        console.warn("[forward] failed:", e);
        failed++;
      }
    }
    setSending(false);
    useSyncStore.getState().refreshRecent({ force: true });
    close();
    if (failed || skipped) {
      Alert.alert(
        failed ? "Some messages were not forwarded" : "Forwarded",
        [failed ? `${failed} could not be sent.` : "", skipped ? `${skipped} of this type cannot be forwarded.` : ""].filter(Boolean).join(" ")
      );
    }
  };

  return (
    <Modal visible={messages !== null} animationType="slide" onRequestClose={close} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: 36 }}>
        <View className="flex-row items-center px-3 pb-2 gap-2">
          <Pressable onPress={close} className="p-2" hitSlop={8}>
            <Icon name="close" size={24} color={colors.onSurface} />
          </Pressable>
          <View className="flex-1">
            <Text style={{ fontSize: 17, fontWeight: "700", color: colors.onSurface }}>Forward to…</Text>
            <Text style={{ fontSize: 12, color: colors.outline }}>{picked.length}/{FORWARD_MAX_TARGETS} selected</Text>
          </View>
        </View>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search name or number"
          placeholderTextColor={colors.outline}
          style={{ marginHorizontal: 12, marginBottom: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.surfaceContainerLow, color: colors.onSurface, fontSize: 15 }}
        />
        <FlatList
          data={targets}
          keyExtractor={(c) => c.id}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Text style={{ color: colors.outline, textAlign: "center", marginTop: 32 }}>No WhatsApp chats found</Text>}
          renderItem={({ item }) => {
            const on = picked.includes(item.id);
            return (
              <Pressable onPress={() => toggle(item.id)} className="flex-row items-center gap-3 px-4 py-3 active:opacity-70">
                <View style={{ backgroundColor: colors.surfaceContainerLow }} className="w-11 h-11 rounded-full items-center justify-center">
                  <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 17 }}>{(item.name || "?").charAt(0).toUpperCase()}</Text>
                </View>
                <View className="flex-1">
                  <Text style={{ color: colors.onSurface, fontSize: 15.5, fontWeight: "600" }} numberOfLines={1}>{item.name}</Text>
                  <Text style={{ color: colors.outline, fontSize: 12.5 }} numberOfLines={1}>{item.phoneNumber}</Text>
                </View>
                <Icon name={on ? "check-circle" : "radio-button-unchecked"} size={24} color={on ? colors.primary : colors.outline} />
              </Pressable>
            );
          }}
        />
        <View style={{ padding: 12, borderTopColor: colors.divider, borderTopWidth: 1 }}>
          <Pressable
            onPress={send}
            disabled={!picked.length || sending}
            style={{ backgroundColor: colors.primary, opacity: picked.length && !sending ? 1 : 0.5 }}
            className="py-3 rounded-xl items-center"
          >
            {sending ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={{ color: colors.onPrimary, fontWeight: "700", fontSize: 15 }}>Forward</Text>}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
