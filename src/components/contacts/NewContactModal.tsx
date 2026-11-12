import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useKeyboardHeight } from '../../hooks/useKeyboardHeight';
import { useRouter } from 'expo-router';
import { Text } from '../ui/Text';
import { Icon } from '../ui/Icon';
import API from '../../config/axios';
import { useSyncStore } from '../../store/syncStore';
import { useThemeStore } from '../../store/themeStore';
import { useNewContactSheet } from '../../store/newContactStore';
import { extractChats } from '../../lib/chatMapping';
import { getWhatsAppAccounts } from '../../lib/socialAccounts';

/**
 * Creates a WhatsApp chat/contact by number (POST /chats). Mounted once at the root; open it with
 * `useNewContactSheet.getState().open('chat' | 'contact')`.
 * 'chat' opens the conversation afterwards; 'contact' just adds it and refreshes the lists.
 */
export function NewContactModal() {
  const mode = useNewContactSheet((s) => s.mode);
  const close = useNewContactSheet((s) => s.close);
  const created = useNewContactSheet((s) => s.created);
  const colors = useThemeStore((s) => s.colors);
  const router = useRouter();
  const keyboardHeight = useKeyboardHeight();

  const [accounts, setAccounts] = useState(getWhatsAppAccounts());
  const [accountId, setAccountId] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!mode) return;
    const list = getWhatsAppAccounts();
    setAccounts(list);
    setAccountId(''); // always chosen by the user: never assume an account
    setName('');
    setPhone('');
  }, [mode]);

  const digits = phone.replace(/\D/g, '');
  const canSubmit = !!accountId && digits.length >= 8 && !saving;

  const openChat = (chat: any, fallbackName: string) => {
    const id = String(chat?._id ?? chat?.id);
    close();
    router.push({
      pathname: `/chat/${id}`,
      params: {
        name: chat?.name || fallbackName || digits,
        channel: 'whatsapp',
        accountId,
        phoneNumber: chat?.phone_number || chat?.phoneNumber || digits,
      },
    } as any);
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const res = await API.post('/chats', { phoneNumber: digits, accountId, channel: 'whatsapp' });
      const chat = res.data?.chat;
      const id = String(chat?._id ?? '');
      // POST /chats only keeps a name when BOTH first and last name are sent, so set it separately
      if (id && name.trim()) {
        try {
          await API.put('/contacts/update-contact', { chatId: id, name: name.trim(), phone_number_id: accountId });
        } catch (e) {
          console.warn('[new contact] could not save the name:', e);
        }
      }
      created();
      useSyncStore.getState().refreshRecent({ force: true });
      if (mode === 'chat' && id) openChat({ ...chat, name: name.trim() || chat?.name }, name.trim());
      else {
        close();
        Alert.alert('Contact added', `${name.trim() || digits} was added.`);
      }
    } catch (e: any) {
      const status = e?.response?.status;
      const message = e?.response?.data?.message;
      if (status === 409) {
        // The number already exists: for "New chat" just open that conversation
        if (mode === 'chat') {
          try {
            const found = await API.get('/chats/v2/all', { params: { searchKey: digits, limit: 5 } });
            const existing = extractChats(found.data).find((c: any) => String(c.phoneNumber ?? c.phone_number ?? '').replace(/\D/g, '').endsWith(digits.slice(-8)));
            if (existing) {
              openChat(existing, '');
              return;
            }
          } catch {
            /* fall through to the message */
          }
        }
        Alert.alert('Already exists', 'A contact with this number already exists.');
      } else if (status === 403) {
        Alert.alert("Can't create", "You don't have permission to create chats or contacts.");
      } else {
        Alert.alert("Couldn't create", message || 'Check the number (include the country code) and try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  const input = { backgroundColor: colors.surfaceContainerLow, borderColor: colors.divider, borderWidth: 1, borderRadius: 10, color: colors.onSurface, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 } as const;
  const title = mode === 'chat' ? 'New chat' : 'Add contact';

  return (
    <Modal visible={mode !== null} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
      <View style={{ flex: 1, paddingBottom: keyboardHeight }}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={close} />
        <View style={{ backgroundColor: colors.surfaceContainerLowest, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.onSurface }}>{title}</Text>
            <Pressable onPress={close} hitSlop={8}>
              <Icon name="close" size={22} color={colors.outline} />
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 14 }}>
            {accounts.length === 0 ? (
              <Text style={{ color: colors.outline }}>
                No WhatsApp account found on this device yet. Open the menu, run “Sync Filters”, and try again.
              </Text>
            ) : (
              <>
                {(
                  <View style={{ gap: 6 }}>
                    <Text style={{ fontSize: 13, color: colors.outline }}>WhatsApp account (required)</Text>
                    {accounts.map((a) => {
                      const on = a.id === accountId;
                      return (
                        <Pressable
                          key={a.id}
                          onPress={() => setAccountId(a.id)}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: on ? colors.primary : colors.divider }}
                        >
                          <Icon name={on ? 'radio-button-checked' : 'radio-button-unchecked'} size={20} color={on ? colors.primary : colors.outline} />
                          <Text style={{ color: colors.onSurface, fontSize: 15 }}>{a.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}

                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 13, color: colors.outline }}>Phone number (with country code)</Text>
                  <TextInput
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    placeholder="e.g. 919876543210"
                    placeholderTextColor={colors.outline}
                    style={input}
                    autoFocus
                  />
                </View>

                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 13, color: colors.outline }}>Name (optional)</Text>
                  <TextInput value={name} onChangeText={setName} placeholder="Contact name" placeholderTextColor={colors.outline} style={input} />
                </View>

                <Pressable
                  onPress={submit}
                  disabled={!canSubmit}
                  style={{ backgroundColor: colors.primary, paddingVertical: 12, borderRadius: 12, alignItems: 'center', opacity: canSubmit ? 1 : 0.5 }}
                >
                  {saving ? (
                    <ActivityIndicator color={colors.onPrimary} />
                  ) : (
                    <Text style={{ color: colors.onPrimary, fontWeight: '700', fontSize: 15 }}>{mode === 'chat' ? 'Start chat' : 'Add contact'}</Text>
                  )}
                </Pressable>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
