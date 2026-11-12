import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { Text } from "../ui/Text";
import { Icon } from "../ui/Icon";
import { useThemeStore } from "../../store/themeStore";
import { getWhatsAppAccounts } from "../../lib/socialAccounts";

/**
 * Asks which WhatsApp account a contact belongs to. Nothing is pre-selected and the confirm button
 * stays disabled until one is chosen, so a contact is never saved to the wrong account by default.
 */
export function AccountPickerModal({
  visible,
  title,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  title: string;
  confirmLabel: string;
  onConfirm: (accountId: string) => void;
  onClose: () => void;
}) {
  const colors = useThemeStore((s) => s.colors);
  const [accounts, setAccounts] = useState(getWhatsAppAccounts());
  const [picked, setPicked] = useState("");

  useEffect(() => {
    if (!visible) return;
    setAccounts(getWhatsAppAccounts());
    setPicked("");
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 24 }} onPress={onClose}>
        <Pressable onPress={() => {}} style={{ backgroundColor: colors.surfaceContainerLowest, borderRadius: 18, padding: 16, maxHeight: "75%" }}>
          <Text style={{ fontSize: 17, fontWeight: "700", color: colors.onSurface }}>{title}</Text>
          <Text style={{ fontSize: 13, color: colors.outline, marginTop: 4, marginBottom: 12 }}>Choose the WhatsApp account to use.</Text>
          {accounts.length === 0 ? (
            <Text style={{ color: colors.outline, marginBottom: 12 }}>
              No WhatsApp account found on this device yet. Open the menu, run “Sync Filters”, and try again.
            </Text>
          ) : (
            <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8 }}>
              {accounts.map((a) => {
                const on = a.id === picked;
                return (
                  <Pressable
                    key={a.id}
                    onPress={() => setPicked(a.id)}
                    style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: on ? colors.primary : colors.divider }}
                  >
                    <Icon name={on ? "radio-button-checked" : "radio-button-unchecked"} size={20} color={on ? colors.primary : colors.outline} />
                    <Text style={{ color: colors.onSurface, fontSize: 15, flexShrink: 1 }}>{a.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
            <Pressable onPress={onClose} style={{ flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center", backgroundColor: colors.surfaceContainerLow }}>
              <Text style={{ color: colors.onSurface, fontWeight: "600" }}>Cancel</Text>
            </Pressable>
            <Pressable
              disabled={!picked}
              onPress={() => onConfirm(picked)}
              style={{ flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center", backgroundColor: colors.primary, opacity: picked ? 1 : 0.5 }}
            >
              <Text style={{ color: colors.onPrimary, fontWeight: "700" }}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
