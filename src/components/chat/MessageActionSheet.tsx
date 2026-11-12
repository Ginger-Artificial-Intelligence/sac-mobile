import { Modal, Pressable, View } from "react-native";
import { Text } from "../ui/Text";
import { Icon } from "../ui/Icon";
import { useThemeStore } from "../../store/themeStore";

export interface MessageAction {
  key: string;
  label: string;
  icon: string;
  onPress: () => void;
  destructive?: boolean;
}

/** Long-press menu of one message: a floating card of the actions that apply to it */
export function MessageActionSheet({
  visible,
  preview,
  actions,
  onClose,
}: {
  visible: boolean;
  preview: string;
  actions: MessageAction[];
  onClose: () => void;
}) {
  const colors = useThemeStore((s) => s.colors);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", padding: 24 }} onPress={onClose}>
        <View style={{ width: "78%", maxWidth: 340, borderRadius: 18, backgroundColor: colors.surfaceContainerLowest, overflow: "hidden" }}>
          {!!preview && (
            <View style={{ paddingHorizontal: 18, paddingVertical: 12, borderBottomColor: colors.divider, borderBottomWidth: 1 }}>
              <Text numberOfLines={2} style={{ color: colors.outline, fontSize: 13 }}>{preview}</Text>
            </View>
          )}
          {actions.map((a) => (
            <Pressable
              key={a.key}
              onPress={() => {
                onClose();
                a.onPress();
              }}
              className="flex-row items-center gap-4 px-5 py-3.5 active:opacity-60"
            >
              <Icon name={a.icon as any} size={22} color={a.destructive ? "#e53935" : colors.onSurface} />
              <Text style={{ fontSize: 16, color: a.destructive ? "#e53935" : colors.onSurface }}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}
