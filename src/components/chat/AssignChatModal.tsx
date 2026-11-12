import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, View } from 'react-native';
import { Text } from '../ui/Text';
import { Icon } from '../ui/Icon';
import API from '../../config/axios';
import { useSyncStore } from '../../store/syncStore';
import { useThemeStore } from '../../store/themeStore';

interface AssignableUser {
  _id: string;
  username: string;
  role?: string;
}

/** Ids of the users a chat is currently assigned to. The list payload may hold ids or populated users. */
function currentAssigneeIds(rawJson: string | null): string[] {
  if (!rawJson) return [];
  try {
    const raw = JSON.parse(rawJson);
    const assigned = raw?.assignedTo ?? raw?.chat?.assignedTo;
    const list = Array.isArray(assigned) ? assigned : assigned ? [assigned] : [];
    return list.map((u: any) => String(u?._id ?? u?.id ?? u)).filter(Boolean);
  } catch {
    return [];
  }
}

export function AssignChatModal({ chatId, visible, onClose }: { chatId: string; visible: boolean; onClose: () => void }) {
  const colors = useThemeStore((s) => s.colors);
  const chat = useSyncStore((s) => s.chats.find((c) => c.id === chatId));
  const assignChat = useSyncStore((s) => s.assignChat);

  const original = useMemo(() => currentAssigneeIds(chat?.rawJson ?? null), [chat?.rawJson]);
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(original));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setSelected(new Set(original));
    let cancelled = false;
    setLoading(true);
    API.get('/clientUser/assignable-users')
      .then((res) => {
        if (!cancelled) setUsers(Array.isArray(res.data?.assignableUsers) ? res.data.assignableUsers : []);
      })
      .catch((e) => {
        if (cancelled) return;
        const forbidden = e?.response?.status === 403;
        Alert.alert('Assign chat', forbidden ? "You don't have permission to assign chats." : 'Could not load users.');
        onClose();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = async () => {
    const toAssign = [...selected].filter((id) => !original.includes(id));
    const toRemove = original.filter((id) => !selected.has(id));
    if (toAssign.length === 0 && toRemove.length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    const names = users.filter((u) => selected.has(u._id)).map((u) => u.username);
    const ok = await assignChat(chatId, toAssign, toRemove, names.length ? names.join(', ') : null);
    setSaving(false);
    if (ok) onClose();
    else Alert.alert('Assign chat', 'Could not update the assignment. Please try again.');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={onClose} />
      <View
        style={{
          backgroundColor: colors.surfaceContainerLowest,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          maxHeight: '70%',
          paddingBottom: 24,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: colors.onSurface }}>Assign chat</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Icon name="close" size={22} color={colors.outline} />
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator style={{ margin: 32 }} color={colors.primary} />
        ) : users.length === 0 ? (
          <Text style={{ color: colors.outline, textAlign: 'center', padding: 24 }}>No users available to assign.</Text>
        ) : (
          <FlatList
            data={users}
            keyExtractor={(u) => u._id}
            renderItem={({ item }) => {
              const on = selected.has(item._id);
              return (
                <Pressable
                  onPress={() => toggle(item._id)}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }}
                >
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      borderWidth: 2,
                      borderColor: on ? colors.primary : colors.outline,
                      backgroundColor: on ? colors.primary : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 12,
                    }}
                  >
                    {on && <Icon name="check" size={14} color="#fff" />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: colors.onSurface }}>{item.username}</Text>
                    {!!item.role && <Text style={{ fontSize: 12, color: colors.outline }}>{item.role}</Text>}
                  </View>
                </Pressable>
              );
            }}
          />
        )}

        <Pressable
          onPress={save}
          disabled={saving || loading}
          style={{
            backgroundColor: colors.primary,
            margin: 16,
            marginBottom: 0,
            paddingVertical: 12,
            borderRadius: 12,
            alignItems: 'center',
            opacity: saving || loading ? 0.6 : 1,
          }}
        >
          <Text style={{ color: colors.onPrimary, fontWeight: '700', fontSize: 15 }}>{saving ? 'Saving…' : 'Save'}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}
