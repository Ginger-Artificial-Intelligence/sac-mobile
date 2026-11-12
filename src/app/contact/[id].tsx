import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "../../components/ui/Text";
import { Icon } from "../../components/ui/Icon";
import { Avatar } from "../../components/ui/Avatar";
import { AssignChatModal } from "../../components/chat/AssignChatModal";
import API from "../../config/axios";
import { useSyncStore } from "../../store/syncStore";
import { useThemeStore } from "../../store/themeStore";

interface LeadStatus {
  _id: string;
  name: string;
  type?: string;
}
interface Lead {
  _id: string;
  status?: string;
}
interface Reminder {
  _id: string;
  content: string;
  reminderTime: string;
}

const errorMessage = (e: any, fallback: string) =>
  e?.response?.status === 403 ? "You don't have permission to do that." : e?.response?.data?.message || fallback;

/** Quick reminder times: the app has no date picker, so offer the common choices */
function reminderPresets(): { label: string; at: Date }[] {
  const now = new Date();
  const inMs = (ms: number) => new Date(now.getTime() + ms);
  const at = (days: number, hour: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return d;
  };
  const presets = [
    { label: "In 30 min", at: inMs(30 * 60 * 1000) },
    { label: "In 1 hour", at: inMs(60 * 60 * 1000) },
    { label: "Today 6 PM", at: at(0, 18) },
    { label: "Tomorrow 9 AM", at: at(1, 9) },
    { label: "In 3 days", at: at(3, 9) },
  ];
  return presets.filter((p) => p.at.getTime() > now.getTime() + 60 * 1000);
}

export default function ContactInfoScreen() {
  const { id, name: nameParam, phone: phoneParam } = useLocalSearchParams<{ id: string; name?: string; phone?: string }>();
  const chatId = String(id);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeStore((s) => s.colors);
  const isDark = useThemeStore((s) => s.isDark);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"Details" | "Reminders">("Details");
  const [assignVisible, setAssignVisible] = useState(false);

  const chat = useSyncStore((s) => s.chats.find((c) => c.id === chatId));
  const patchChat = useSyncStore((s) => s.patchChat);
  const setChatBlocked = useSyncStore((s) => s.setChatBlocked);

  const displayName = chat?.name || nameParam || "Contact";
  const phone = chat?.phoneNumber || phoneParam || "";
  const phoneNumberId = chat?.channel === "whatsapp" ? chat?.accountId || undefined : undefined;

  const savedNotes = useMemo(() => {
    try {
      const raw = chat?.rawJson ? JSON.parse(chat.rawJson) : null;
      return String(raw?.notes ?? raw?.chat?.notes ?? "");
    } catch {
      return "";
    }
  }, [chat?.rawJson]);

  const [name, setName] = useState(displayName);
  const [notes, setNotes] = useState(savedNotes);
  const [savingName, setSavingName] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  useEffect(() => setName(displayName), [displayName]);
  useEffect(() => setNotes(savedNotes), [savedNotes]);

  const saveName = async () => {
    const next = name.trim();
    if (!next || next === displayName) return;
    setSavingName(true);
    try {
      await API.put("/contacts/update-contact", { chatId, name: next, ...(phoneNumberId ? { phone_number_id: phoneNumberId } : {}) });
      await patchChat(chatId, { name: next });
    } catch (e) {
      Alert.alert("Could not save name", errorMessage(e, "Please try again."));
      setName(displayName);
    } finally {
      setSavingName(false);
    }
  };

  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      await API.patch(`/chats/${chatId}/notes`, { notes });
    } catch (e) {
      Alert.alert("Could not save notes", errorMessage(e, "Please try again."));
    } finally {
      setSavingNotes(false);
    }
  };

  // ── Lead (statuses are configured per workspace) ────────────────────────────
  const statusesQuery = useQuery({
    queryKey: ["lead-statuses"],
    queryFn: async (): Promise<LeadStatus[]> => (await API.get("/leads/statuses")).data?.data ?? [],
    staleTime: 10 * 60 * 1000,
  });
  const leadQuery = useQuery({
    queryKey: ["lead", chatId],
    queryFn: async (): Promise<Lead | null> => (await API.get("/leads", { params: { chatId } })).data?.data?.[0] ?? null,
  });
  const lead = leadQuery.data;
  const currentStatus = lead?.status || chat?.leadStage || "";
  const [savingLead, setSavingLead] = useState(false);

  // Create the lead (first status chosen, or the server default) or move an existing one
  const saveLead = async (status?: string) => {
    if (lead && status === currentStatus) return;
    setSavingLead(true);
    try {
      if (lead?._id) await API.patch(`/leads/${lead._id}`, { status });
      else await API.post("/leads", { chatId, value: 0, notes, ...(status ? { status } : {}) });
      if (status) await patchChat(chatId, { leadStage: status });
      await queryClient.invalidateQueries({ queryKey: ["lead", chatId] });
    } catch (e) {
      Alert.alert("Could not update lead", errorMessage(e, "Please try again."));
    } finally {
      setSavingLead(false);
    }
  };

  const confirmBlock = () => {
    const blocking = !chat?.isBlocked;
    Alert.alert(blocking ? "Block contact" : "Unblock contact", blocking ? `Block ${displayName}?` : `Unblock ${displayName}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: blocking ? "Block" : "Unblock",
        style: blocking ? "destructive" : "default",
        onPress: async () => {
          if (!(await setChatBlocked(chatId, blocking))) Alert.alert("Could not update", "The server refused the change or you are offline.");
        },
      },
    ]);
  };

  const card = { backgroundColor: colors.surfaceContainerLowest, borderColor: colors.divider, borderWidth: 1, borderRadius: 14, padding: 16 } as const;
  const input = { backgroundColor: colors.surfaceContainerLow, borderColor: colors.divider, borderWidth: 1, borderRadius: 10, color: colors.onSurface, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15 } as const;
  const button = (disabled?: boolean) => ({ backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, alignItems: "center" as const, opacity: disabled ? 0.5 : 1 });
  const label = { fontSize: 13, color: colors.outline, marginBottom: 4 } as const;
  const heading = { fontSize: 16, fontWeight: "700", color: colors.onSurface } as const;
  const actionRow = { ...card, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 } as const;

  const lastActivity = chat?.updatedAt ? new Date(chat.updatedAt).toLocaleString([], { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View
        style={{ paddingTop: Math.max(insets.top, 16), backgroundColor: colors.surfaceContainerLowest, borderBottomColor: colors.divider, borderBottomWidth: 1 }}
        className="flex-row items-center px-4 pb-3 gap-3"
      >
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Icon name="arrow-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.onSurface }}>Contact info</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 48 + Math.max(insets.bottom, 16) }} keyboardShouldPersistTaps="handled">
        <View style={{ ...card, alignItems: "center", paddingVertical: 24 }}>
          <Avatar
            source={chat?.avatar?.startsWith("http") ? { uri: chat.avatar } : undefined}
            fallback={displayName.charAt(0).toUpperCase()}
            size={80}
          />
          <Text style={{ fontSize: 20, fontWeight: "700", color: colors.onSurface, marginTop: 12 }}>{displayName}</Text>
          {!!phone && <Text selectable style={{ fontSize: 14, color: colors.outline, marginTop: 4 }}>{phone}</Text>}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap", justifyContent: "center" }}>
            {!!chat?.channel && (
              <View style={{ backgroundColor: colors.surfaceContainerLow, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: colors.onSurface, textTransform: "capitalize" }}>{chat.channel}</Text>
              </View>
            )}
            {!!chat?.assignedToName && (
              <View style={{ backgroundColor: colors.surfaceContainerLow, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: colors.onSurface }}>Assigned to {chat.assignedToName}</Text>
              </View>
            )}
            {chat?.isBlocked && (
              <View style={{ backgroundColor: isDark ? "#4c1d1d" : "#fee2e2", paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 }}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: isDark ? "#fca5a5" : "#b91c1c" }}>Blocked</Text>
              </View>
            )}
          </View>
        </View>

        <View style={{ flexDirection: "row", borderBottomColor: colors.divider, borderBottomWidth: 1 }}>
          {(["Details", "Reminders"] as const).map((t) => (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              style={{ flex: 1, alignItems: "center", paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: tab === t ? colors.primary : "transparent" }}
            >
              <Text style={{ fontSize: 15, fontWeight: tab === t ? "700" : "500", color: tab === t ? colors.primary : colors.outline }}>{t}</Text>
            </Pressable>
          ))}
        </View>

        {tab === "Details" ? (
          <>
            {/* Lead management */}
            <View style={{ ...card, gap: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={heading}>Lead management</Text>
                {(savingLead || leadQuery.isLoading || statusesQuery.isLoading) && <ActivityIndicator size="small" color={colors.primary} />}
              </View>
              {!lead && !leadQuery.isLoading ? (
                <>
                  <Text style={{ color: colors.outline, fontSize: 13 }}>This contact is not marked as a lead.</Text>
                  <Pressable onPress={() => saveLead()} disabled={savingLead} style={{ ...button(savingLead), flexDirection: "row", justifyContent: "center", gap: 8 }}>
                    <Icon name="local-offer" size={18} color={colors.onPrimary} />
                    <Text style={{ color: colors.onPrimary, fontWeight: "700" }}>Mark as lead</Text>
                  </Pressable>
                </>
              ) : statusesQuery.isError ? (
                <Text style={{ color: colors.outline, fontSize: 13 }}>Could not load lead statuses.</Text>
              ) : (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {(statusesQuery.data ?? []).map((s) => {
                    const active = s.name === currentStatus;
                    return (
                      <Pressable
                        key={s._id}
                        disabled={savingLead}
                        onPress={() => saveLead(s.name)}
                        style={{
                          paddingHorizontal: 14,
                          paddingVertical: 7,
                          borderRadius: 20,
                          backgroundColor: active ? colors.primary : colors.surfaceContainerLow,
                          borderWidth: active ? 0 : 1,
                          borderColor: colors.divider,
                        }}
                      >
                        <Text style={{ fontSize: 14, fontWeight: "600", color: active ? colors.onPrimary : colors.primary }}>{s.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>

            {/* Profile details */}
            <View style={{ ...card, gap: 12 }}>
              <Text style={heading}>Profile details</Text>

              <View>
                <Text style={label}>Display name</Text>
                <TextInput value={name} onChangeText={setName} style={input} placeholder="Contact name" placeholderTextColor={colors.outline} />
                {name.trim() !== displayName && !!name.trim() && (
                  <Pressable onPress={saveName} disabled={savingName} style={{ ...button(savingName), marginTop: 8 }}>
                    <Text style={{ color: colors.onPrimary, fontWeight: "700" }}>{savingName ? "Saving…" : "Save name"}</Text>
                  </Pressable>
                )}
              </View>

              {!!phone && (
                <View>
                  <Text style={label}>Phone number</Text>
                  <Text selectable style={{ ...input, color: colors.onSurface }}>{phone}</Text>
                </View>
              )}

              {!!lastActivity && (
                <View>
                  <Text style={label}>Last activity</Text>
                  <Text style={{ fontSize: 15, color: colors.onSurface }}>{lastActivity}</Text>
                </View>
              )}

              <View>
                <Text style={label}>Notes</Text>
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  style={{ ...input, minHeight: 90, textAlignVertical: "top" }}
                  placeholder="Add notes for this contact…"
                  placeholderTextColor={colors.outline}
                />
                {notes !== savedNotes && (
                  <Pressable onPress={saveNotes} disabled={savingNotes} style={{ ...button(savingNotes), marginTop: 8 }}>
                    <Text style={{ color: colors.onPrimary, fontWeight: "700" }}>{savingNotes ? "Saving…" : "Save notes"}</Text>
                  </Pressable>
                )}
              </View>
            </View>

            {/* Useful actions */}
            <Text style={{ ...heading, marginBottom: -4 }}>Useful actions</Text>
            <Pressable onPress={() => setAssignVisible(true)} style={actionRow}>
              <Icon name="person-add" size={22} color={colors.primary} />
              <Text style={{ fontSize: 16, fontWeight: "600", color: colors.onSurface }}>Assign chat</Text>
            </Pressable>
            <Pressable onPress={confirmBlock} style={actionRow}>
              <Icon name="block" size={22} color={isDark ? "#f87171" : "#dc2626"} />
              <Text style={{ fontSize: 16, fontWeight: "700", color: isDark ? "#f87171" : "#dc2626" }}>
                {chat?.isBlocked ? "Unblock contact" : "Block contact"}
              </Text>
            </Pressable>
          </>
        ) : (
          <RemindersTab chatId={chatId} card={card} input={input} button={button} />
        )}
      </ScrollView>

      {assignVisible && <AssignChatModal chatId={chatId} visible={assignVisible} onClose={() => setAssignVisible(false)} />}
    </View>
  );
}

function RemindersTab({ chatId, card, input, button }: { chatId: string; card: any; input: any; button: (d?: boolean) => any }) {
  const colors = useThemeStore((s) => s.colors);
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");
  const [when, setWhen] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const presets = useMemo(reminderPresets, []);

  const remindersQuery = useQuery({
    queryKey: ["reminders", chatId],
    queryFn: async (): Promise<Reminder[]> => (await API.get(`/reminders/chat/${chatId}`)).data?.data ?? [],
  });

  const add = async () => {
    if (!content.trim() || !when) return;
    setSaving(true);
    try {
      await API.post("/reminders", { chatId, content: content.trim(), reminderTime: when.toISOString() });
      setContent("");
      setWhen(null);
      await queryClient.invalidateQueries({ queryKey: ["reminders", chatId] });
    } catch (e) {
      Alert.alert("Could not add reminder", errorMessage(e, "Please try again."));
    } finally {
      setSaving(false);
    }
  };

  const remove = (r: Reminder) =>
    Alert.alert("Delete reminder", "Delete this reminder?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await API.delete(`/reminders/${r._id}`);
            await queryClient.invalidateQueries({ queryKey: ["reminders", chatId] });
          } catch (e) {
            Alert.alert("Could not delete", errorMessage(e, "Please try again."));
          }
        },
      },
    ]);

  const fmt = (d: Date | string) => new Date(d).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <>
      <View style={{ ...card, gap: 10 }}>
        <Text style={{ fontSize: 16, fontWeight: "700", color: colors.onSurface }}>New reminder</Text>
        <TextInput
          value={content}
          onChangeText={setContent}
          multiline
          style={{ ...input, minHeight: 64, textAlignVertical: "top" }}
          placeholder="What should we remind you about?"
          placeholderTextColor={colors.outline}
        />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {presets.map((p) => {
            const active = when?.getTime() === p.at.getTime();
            return (
              <Pressable
                key={p.label}
                onPress={() => setWhen(p.at)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: 20,
                  backgroundColor: active ? colors.primary : colors.surfaceContainerLow,
                  borderWidth: active ? 0 : 1,
                  borderColor: colors.divider,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: "600", color: active ? colors.onPrimary : colors.primary }}>{p.label}</Text>
              </Pressable>
            );
          })}
        </View>
        {when && <Text style={{ color: colors.outline, fontSize: 13 }}>Reminds you on {fmt(when)}</Text>}
        <Pressable onPress={add} disabled={saving || !content.trim() || !when} style={button(saving || !content.trim() || !when)}>
          <Text style={{ color: colors.onPrimary, fontWeight: "700" }}>{saving ? "Adding…" : "Add reminder"}</Text>
        </Pressable>
      </View>

      <View style={{ ...card, gap: 8 }}>
        <Text style={{ fontSize: 16, fontWeight: "700", color: colors.onSurface }}>Upcoming reminders</Text>
        {remindersQuery.isLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : remindersQuery.isError ? (
          <Text style={{ color: colors.outline }}>Could not load reminders.</Text>
        ) : (remindersQuery.data ?? []).length === 0 ? (
          <Text style={{ color: colors.outline }}>No pending reminders for this chat.</Text>
        ) : (
          remindersQuery.data!.map((r) => (
            <View key={r._id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderTopColor: colors.divider, borderTopWidth: 1 }}>
              <Icon name="notifications-active" size={20} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, color: colors.onSurface }}>{r.content}</Text>
                <Text style={{ fontSize: 12, color: colors.outline, marginTop: 2 }}>{fmt(r.reminderTime)}</Text>
              </View>
              <Pressable onPress={() => remove(r)} hitSlop={8}>
                <Icon name="delete-outline" size={22} color={colors.outline} />
              </Pressable>
            </View>
          ))
        )}
      </View>
    </>
  );
}
