import { View, TextInput, Pressable, ScrollView, Alert } from "react-native";
import { Text } from "../components/ui/Text";
import { Icon } from "../components/ui/Icon";
import { Badge } from "../components/ui/Badge";
import { LoadingSpinner } from "../components/ui/Loading";
import { NativeDropdown } from "../components/ui/NativeDropdown";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useSyncStore } from "../store/syncStore";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { FlashList } from "@shopify/flash-list";
import API from "../config/axios";
import { storage } from "../store/mmkv";
import { useThemeStore } from "../store/themeStore";
import { useNewContactSheet } from "../store/newContactStore";
import { useShellNav } from "../store/shellNavStore";
import { AccountPickerModal } from "../components/contacts/AccountPickerModal";
import * as DocumentPicker from "expo-document-picker";

const CHANNEL_FILTERS = ["All", "whatsapp", "messenger", "instagram"] as const;
type ChannelFilter = (typeof CHANNEL_FILTERS)[number];
const PAGE_SIZE = 30;

interface ContactRow {
  id: string; // a contact's _id is also its chat's _id
  name: string;
  phone: string | null;
  email: string | null;
  channel: string | null;
  accountId: string | null;
  isBlocked: boolean;
  status: string | null;
  lastActivity: string | null;
}

function toRow(c: any): ContactRow {
  return {
    id: String(c._id || c.id),
    name: c.name || c.phoneNumber || c.phone_number || "Contact",
    phone: c.phoneNumber || c.phone_number || null,
    email: c.email || null,
    channel: c.channel || null,
    accountId: c.accountId || c.phone_number_id || null,
    isBlocked: Boolean(c.isBlocked),
    status: c.tags?.[0] || null,
    lastActivity: c.updatedAt || c.createdAt || null,
  };
}

const errorMessage = (e: any, fallback: string) =>
  e?.response?.status === 403 ? "You don't have permission to do that." : e?.response?.data?.message || fallback;

export default function ContactsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const savedContacts = useSyncStore((state) => state.contacts);
  const loadContacts = useSyncStore((state) => state.loadContacts);
  const isDark = useThemeStore((state) => state.isDark);
  const colors = useThemeStore((state) => state.colors);

  const [rows, setRows] = useState<ContactRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offline, setOffline] = useState(false);

  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState<ChannelFilter>("All");
  const [account, setAccount] = useState("All");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Social accounts cached by the sync (same source the inbox filter uses)
  const accountOptions = useMemo(() => {
    const opts = [{ label: "All Accounts", value: "All", channel: "all" as string, phoneNumber: "" }];
    try {
      const raw = storage.getString("cached_social_accounts");
      const accs: any[] = raw ? JSON.parse(raw) : [];
      for (const acc of accs) {
        const id = acc.phoneNumberId || acc.phone_number_id || acc.accountId || acc.account_id || acc._id;
        const label = acc.name || acc.phoneNumber || acc.phoneNumberId || acc.accountLabel || acc.accountName;
        if (id && label) opts.push({ label, value: String(id), channel: acc.channel || "whatsapp", phoneNumber: "" });
      }
    } catch {
      /* no cached accounts yet */
    }
    return opts;
  }, []);

  // Debounce the search box so we do not hit the server on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchText.trim()), 350);
    return () => clearTimeout(t);
  }, [searchText]);

  useEffect(() => {
    loadContacts();
  }, []);

  const requestId = useRef(0);

  const fetchPage = useCallback(
    async (pageNum: number, replace: boolean) => {
      const id = ++requestId.current;
      if (replace) setLoading(true);
      else setLoadingMore(true);
      try {
        const res = await API.get("/contacts", {
          params: {
            page: pageNum,
            limit: PAGE_SIZE,
            ...(search ? { search } : {}),
            ...(channel !== "All" ? { channel } : {}),
            ...(account !== "All" ? { accountId: account } : {}),
          },
        });
        if (id !== requestId.current) return; // a newer filter/search superseded this request
        const list: any[] = Array.isArray(res.data?.contacts) ? res.data.contacts : [];
        const mapped = list.map(toRow);
        setRows((prev) => {
          if (replace) return mapped;
          const seen = new Set(prev.map((r) => r.id));
          return [...prev, ...mapped.filter((r) => !seen.has(r.id))];
        });
        setPage(pageNum);
        setTotalPages(Number(res.data?.totalPages) || 1);
        setTotal(typeof res.data?.totalContact === "number" ? res.data.totalContact : null);
        setOffline(false);
      } catch (e) {
        if (id !== requestId.current) return;
        console.warn("[contacts] fetch failed:", e);
        if (replace) setOffline(true);
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [search, channel, account]
  );

  // Any filter/search change starts again from page 1
  useEffect(() => {
    fetchPage(1, true);
  }, [fetchPage]);

  // If the server cannot be reached, fall back to the contacts saved on this device
  const offlineRows = useMemo<ContactRow[]>(() => {
    if (!offline) return [];
    const q = search.toLowerCase();
    return savedContacts
      .filter((c) => (channel === "All" || c.channel?.toLowerCase() === channel))
      .filter((c) => !q || c.name?.toLowerCase().includes(q) || c.phone?.toLowerCase().includes(q) || c.username?.toLowerCase().includes(q))
      .map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        email: c.username,
        channel: c.channel,
        accountId: null,
        isBlocked: false,
        status: c.status,
        lastActivity: c.lastActivity,
      }));
  }, [offline, savedContacts, search, channel]);

  const data = offline ? offlineRows : rows;

  const loadMore = useCallback(() => {
    if (offline || loading || loadingMore || page >= totalPages) return;
    fetchPage(page + 1, false);
  }, [offline, loading, loadingMore, page, totalPages, fetchPage]);

  // ── Per-contact actions ────────────────────────────────────────────────────
  const openChat = (c: ContactRow) =>
    router.push({
      pathname: `/chat/${c.id}`,
      params: { name: c.name, channel: c.channel || "", accountId: c.accountId || "", phoneNumber: c.phone || "" },
    } as any);

  const openInfo = (c: ContactRow) =>
    router.push({ pathname: `/contact/${c.id}`, params: { name: c.name, phone: c.phone || "" } } as any);

  const toggleBlock = (c: ContactRow) => {
    const blocking = !c.isBlocked;
    Alert.alert(blocking ? "Block contact" : "Unblock contact", blocking ? `Block ${c.name}?` : `Unblock ${c.name}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: blocking ? "Block" : "Unblock",
        style: blocking ? "destructive" : "default",
        onPress: async () => {
          try {
            await API.patch(`/contacts/block-unblock/${c.id}`, {
              isBlock: blocking,
              ...(c.accountId ? { phone_number_id: c.accountId } : {}),
            });
            setRows((prev) => prev.map((r) => (r.id === c.id ? { ...r, isBlocked: blocking } : r)));
          } catch (e) {
            Alert.alert("Could not update", errorMessage(e, "Please try again."));
          }
        },
      },
    ]);
  };

  const deleteContact = (c: ContactRow) =>
    Alert.alert("Delete contact", `Delete ${c.name}? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await API.delete(`/contacts/${c.id}`);
            setRows((prev) => prev.filter((r) => r.id !== c.id));
            setTotal((t) => (t == null ? t : Math.max(0, t - 1)));
          } catch (e) {
            Alert.alert("Could not delete", errorMessage(e, "Please try again."));
          }
        },
      },
    ]);

  const menuActions = (c: ContactRow) => [
    { label: "Open chat", icon: "chat", onClick: () => openChat(c) },
    { label: "Contact info / edit", icon: "person", onClick: () => openInfo(c) },
    { label: c.isBlocked ? "Unblock" : "Block", icon: "block", onClick: () => toggleBlock(c) },
    { label: "Delete", icon: "delete-outline", onClick: () => deleteContact(c) },
  ];

  // A contact was added from the shared sheet: reload from the top
  const sheetVersion = useNewContactSheet((s) => s.version);
  useEffect(() => {
    if (sheetVersion > 0) fetchPage(1, true);
  }, [sheetVersion]);

  // CSV import: POST /contacts as multipart (field "contacts"). Columns: name, contacts (phone with
  // country code); optional username, channel, group. The WhatsApp account is always chosen explicitly
  // first (nothing is assumed), and nothing is uploaded until one is picked.
  const [showAccountFilter, setShowAccountFilter] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importPickerOpen, setImportPickerOpen] = useState(false);
  const runImport = async (accountId: string) => {
    if (!accountId) return;
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: ["text/csv", "text/comma-separated-values", "application/vnd.ms-excel", "text/plain"], copyToCacheDirectory: true });
      if (picked.canceled || !picked.assets?.[0]) return;
      const file = picked.assets[0];
      setImporting(true);
      const form = new FormData();
      form.append("contacts", { uri: file.uri, name: file.name || "contacts.csv", type: file.mimeType || "text/csv" } as any);
      form.append("accountId", accountId);
      form.append("socialAccountId", accountId);
      form.append("channel", "whatsapp");
      const res = await API.post("/contacts", form, { headers: { "Content-Type": "multipart/form-data" }, timeout: 120000 });
      const d = res.data ?? {};
      const rejected: any[] = Array.isArray(d.rejected) ? d.rejected : [];
      Alert.alert(
        "Import finished",
        `Added ${d.added ?? 0} of ${d.total ?? 0}` +
          (d.duplicates ? `\n${d.duplicates} already existed` : "") +
          (rejected.length ? `\n${rejected.length} skipped: ${rejected[0]?.reason || "invalid number"}` : "")
      );
      fetchPage(1, true);
    } catch (e: any) {
      Alert.alert("Import failed", e?.response?.status === 403 ? "You don't have permission to import contacts." : e?.response?.data?.message || "Could not upload the file.");
    } finally {
      setImporting(false);
    }
  };
  // The Import button sits in the shell header and asks for an import through this counter
  const importNonce = useShellNav((s) => s.importNonce);
  const importSeen = useRef(importNonce);
  useEffect(() => {
    if (importNonce === importSeen.current) return;
    importSeen.current = importNonce;
    importCsv();
  }, [importNonce]);

  const importCsv = () =>
    Alert.alert("Import contacts", "Choose a CSV file with the columns “name” and “contacts” (the phone number with country code). Optional: username, channel, group.", [
      { text: "Cancel", style: "cancel" },
      { text: "Next", onPress: () => setImportPickerOpen(true) },
    ]);

  const selectedAccountLabel = accountOptions.find((o) => o.value === account)?.label ?? "All Accounts";

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6, backgroundColor: colors.surface }}>
        {/* Search */}
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceContainerLow, borderRadius: 24, paddingLeft: 16, paddingRight: 6, height: 48, marginBottom: 12 }}>
          <Icon name="search" size={20} color={colors.outline} />
          <View style={{ flex: 1, marginLeft: 10, justifyContent: "center" }}>
            {/* The native placeholder ignores the app font on some Samsung phones, so it is drawn as Text */}
            {searchText.length === 0 && (
              <Text pointerEvents="none" numberOfLines={1} style={{ position: "absolute", left: 0, right: 0, fontSize: 16, color: colors.outline }}>
                {total ? `Search ${total.toLocaleString()} contacts` : "Search name, phone or email"}
              </Text>
            )}
            <TextInput
              style={{ fontSize: 16, color: colors.onSurface, fontFamily: "PlusJakartaSans_400Regular", padding: 0 }}
              accessibilityLabel="Search name, phone or email"
              value={searchText}
              onChangeText={setSearchText}
              clearButtonMode="while-editing"
            />
          </View>
          {searchText.length > 0 && (
            <Pressable onPress={() => setSearchText("")} hitSlop={10} accessibilityLabel="Clear search">
              <Icon name="cancel" size={20} color={colors.outline} />
            </Pressable>
          )}
          {accountOptions.length > 1 && (
            <Pressable
              onPress={() => setShowAccountFilter((v) => !v)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Filter by account"
              accessibilityState={{ expanded: showAccountFilter }}
              style={{ marginLeft: 8, width: 40, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: showAccountFilter || account !== "All" ? colors.primaryTint : "transparent" }}
            >
              <Icon name="tune" size={20} color={showAccountFilter || account !== "All" ? colors.primary : colors.onSurfaceVariant} />
            </Pressable>
          )}
        </View>

        {/* Account dropdown (only when accounts are known) */}
        {accountOptions.length > 1 && (showAccountFilter || account !== "All") && (
          <NativeDropdown
            expanded={accountMenuOpen}
            onDismissRequest={() => setAccountMenuOpen(false)}
            onRequestOpen={() => setAccountMenuOpen(true)}
            style={{ height: 38, marginBottom: 10 }}
            trigger={
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, borderRadius: 19, backgroundColor: colors.surfaceContainerLow, height: "100%", width: "100%" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                  <Icon name="account-circle" size={16} color={colors.onSurfaceVariant} />
                  <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "500", color: colors.onSurfaceVariant, flex: 1 }}>
                    {selectedAccountLabel}
                  </Text>
                </View>
                <Icon name="expand-more" size={18} color={colors.outline} />
              </View>
            }
            actions={accountOptions.map((o) => ({
              label: o.label,
              channel: o.channel,
              phoneNumber: o.phoneNumber,
              onClick: () => setAccount(o.value),
            }))}
          />
        )}

        {/* Channel pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {CHANNEL_FILTERS.map((ch) => {
            const active = channel === ch;
            return (
              <Pressable
                key={ch}
                onPress={() => setChannel(ch)}
                style={{
                  paddingHorizontal: 14, height: 36, justifyContent: "center", borderRadius: 18,
                  backgroundColor: active ? colors.primaryTint : colors.surfaceContainerLow,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: active ? "700" : "500", color: active ? colors.primary : colors.onSurfaceVariant, textTransform: "capitalize" }}>
                  {ch === "All" ? "All Channels" : ch}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Offline notice only; the count lives in the search placeholder, Add and Import in the header */}
        {offline && (
          <Text style={{ fontSize: 13.5, color: colors.outline, marginTop: 10 }} numberOfLines={1}>
            {data.length} saved on this device (offline)
          </Text>
        )}
      </View>

      <FlashList
        data={data}
        keyExtractor={(item) => item.id}
        onRefresh={() => fetchPage(1, true)}
        refreshing={false}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          loading ? (
            <View style={{ alignItems: "center", paddingTop: 60, gap: 14 }}>
              <LoadingSpinner size={36} iconName="sync" />
              <Text style={{ fontSize: 15, color: colors.outline }}>{search ? "Searching…" : "Loading contacts…"}</Text>
            </View>
          ) : (
            <View style={{ alignItems: "center", paddingTop: 60, gap: 10 }}>
              <Icon name="people-outline" size={48} color={colors.outlineVariant} />
              <Text style={{ fontSize: 16, color: colors.outline }}>No contacts found</Text>
            </View>
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={{ alignItems: "center", paddingVertical: 16 }}>
              <LoadingSpinner size={22} />
            </View>
          ) : null
        }
        contentContainerStyle={{ paddingBottom: 112 + Math.max(insets.bottom, 16) }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item: contact }) => (
          <View>
            <Pressable
              onPress={() => openInfo(contact)}
              onLongPress={() => openChat(contact)}
              android_ripple={{ color: colors.primaryTint }}
            >
              <View style={{ paddingLeft: 16, paddingRight: 6, minHeight: 72, justifyContent: "center" }}>
                <View pointerEvents="none" style={{ position: "absolute", left: 76, right: 0, bottom: 0, height: 1, backgroundColor: colors.divider }} />
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", flex: 1, marginRight: 8 }}>
                    <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primaryTint, alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                      <Text style={{ fontSize: 19, fontWeight: "700", color: colors.primary }}>
                        {contact.name?.charAt(0)?.toUpperCase() ?? "?"}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <Text numberOfLines={1} style={{ fontWeight: "600", fontSize: 16.5, lineHeight: 22, color: colors.onSurface, flexShrink: 1 }}>{contact.name}</Text>
                        {contact.isBlocked && <Badge variant="secondary" label="Blocked" />}
                        {!contact.isBlocked && contact.status && <Badge variant="secondary" label={contact.status} />}
                      </View>
                      <Text numberOfLines={1} style={{ fontSize: 14, lineHeight: 20, color: colors.outline, marginTop: 2 }}>
                        {contact.phone || contact.email || ""}
                        {contact.channel ? `  ·  ${contact.channel}` : ""}
                      </Text>
                    </View>
                  </View>

                  <Pressable onPress={() => openChat(contact)} accessibilityLabel="Open chat" style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
                    <Icon name="chat" size={22} color={colors.primary} />
                  </Pressable>
                  <NativeDropdown
                    expanded={openMenuId === contact.id}
                    onDismissRequest={() => setOpenMenuId(null)}
                    onRequestOpen={() => setOpenMenuId(contact.id)}
                    style={{ width: 40, height: 40 }}
                    trigger={
                      <View style={{ width: 36, height: 36, borderRadius: 18, justifyContent: "center", alignItems: "center" }}>
                        <Icon name="more-vert" size={22} color={colors.outline} />
                      </View>
                    }
                    actions={menuActions(contact)}
                  />
                </View>
              </View>
            </Pressable>
          </View>
        )}
      />
      <AccountPickerModal
        visible={importPickerOpen}
        title="Import contacts to"
        confirmLabel="Choose file"
        onClose={() => setImportPickerOpen(false)}
        onConfirm={(accountId) => {
          setImportPickerOpen(false);
          runImport(accountId);
        }}
      />
    </View>
  );
}
