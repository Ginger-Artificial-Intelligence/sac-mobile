import { ScrollView, View, Pressable, ActivityIndicator, Alert } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Text } from "../components/ui/Text";
import { Icon } from "../components/ui/Icon";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import API from "../config/axios";
import { useSyncStore } from "../store/syncStore";
import { useThemeStore, ThemeMode } from "../store/themeStore";

interface MyProfile {
  name: string;
  email: string;
  phone: string;
  role: string;
  company: string;
  plan: string;
  timezone: string;
  country: string;
}

// GET /auth/me -> { status, data: { user, clientUser, rolename, plan?, timezone, defaultCountry, ... } }.
// The plan is only present when the user may view billing, and name/email/phone live on `clientUser`
// for team members and on `user` for the account owner (the web app tries both spellings too).
function normalizeProfile(body: any): MyProfile {
  const d = body?.data ?? body ?? {};
  const u = d.clientUser ?? d.user ?? {};
  const str = (...values: any[]) => String(values.find((v) => typeof v === "string" && v.trim()) ?? "").trim();
  return {
    name: str(u.username, u.name, d.clientName, d.username),
    email: str(u.useremail, u.email, d.email),
    phone: str(u.userphone, u.phone, d.phone),
    role: str(d.rolename, u.roleID?.rolename, u.role),
    company: str(d.user?.companyName, u.companyName, d.companyName),
    plan: str(d.plan),
    timezone: str(d.timezone),
    country: str(d.defaultCountry),
  };
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const logout = useSyncStore((state) => state.logout);
  const storedName = useSyncStore((state) => state.userName);
  const storedEmail = useSyncStore((state) => state.userEmail);
  const storedRole = useSyncStore((state) => state.userRole);
  const themeMode = useThemeStore((state) => state.themeMode);
  const setThemeMode = useThemeStore((state) => state.setThemeMode);
  const isDark = useThemeStore((state) => state.isDark);
  const colors = useThemeStore((state) => state.colors);

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["my-profile"],
    queryFn: async () => normalizeProfile((await API.get("/auth/me")).data),
    staleTime: 5 * 60 * 1000,
  });

  // Until /auth/me answers (or if it fails) show what we already know from login
  const name = data?.name || storedName || "";
  const email = data?.email || storedEmail || "";
  const role = data?.role || storedRole || "";

  const rows: { icon: string; label: string; value: string }[] = [
    { icon: "person", label: "Name", value: name },
    { icon: "email", label: "Email", value: email },
    { icon: "call", label: "Phone", value: data?.phone ?? "" },
    { icon: "work", label: "Role", value: role },
    { icon: "domain", label: "Company", value: data?.company ?? "" },
    { icon: "workspace-premium", label: "Plan", value: data?.plan ?? "" },
    { icon: "schedule", label: "Timezone", value: [data?.timezone, data?.country].filter(Boolean).join(" · ") },
  ].filter((r) => r.value);

  const confirmLogout = () =>
    Alert.alert("Log out", "Log out of this device? Chats stored on it will be removed.", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: () => logout() },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 112 + Math.max(insets.bottom, 16) }}
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar */}
        <View className="items-center mt-6 mb-8">
          <View
            style={{
              width: 112,
              height: 112,
              borderRadius: 56,
              flexShrink: 0,
              alignSelf: "center",
              backgroundColor: isDark ? "#172435" : "#dde3f9",
              borderColor: colors.surfaceContainerLowest,
              borderWidth: 4,
              overflow: "hidden",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: colors.primary, fontSize: 44, fontWeight: "700", lineHeight: 52, includeFontPadding: false }}>
              {(name || email || "?").charAt(0).toUpperCase()}
            </Text>
          </View>
          {!!name && (
            <Text style={{ fontSize: 20, fontWeight: "700", color: colors.onSurface, marginTop: 12 }}>{name}</Text>
          )}
          {!!role && <Text style={{ fontSize: 14, color: colors.outline, marginTop: 2 }}>{role}</Text>}
        </View>

        {isLoading && (
          <ActivityIndicator color={colors.primary} style={{ marginBottom: 16 }} />
        )}
        {isError && (
          <Pressable
            onPress={() => refetch()}
            className="mx-4 mb-4 px-4 py-3 rounded-lg flex-row items-center justify-between"
            style={{ backgroundColor: colors.surfaceContainerLow, borderColor: colors.divider, borderWidth: 1 }}
          >
            <Text style={{ color: colors.onSurfaceVariant, fontSize: 13, flex: 1 }}>
              Could not load your full profile. Tap to retry.
            </Text>
            {isRefetching ? <ActivityIndicator size="small" color={colors.primary} /> : <Icon name="refresh" size={20} color={colors.primary} />}
          </Pressable>
        )}

        {/* Details */}
        <View className="px-2">
          {rows.map((row) => (
            <View key={row.label} className="flex-row items-center px-4 py-3">
              <View className="w-10 items-center justify-center">
                <Icon name={row.icon as any} size={24} color={colors.outline} />
              </View>
              <View style={{ borderBottomColor: colors.divider, borderBottomWidth: 1 }} className="flex-1 pb-3">
                <Text style={{ fontSize: 13, color: colors.outline, marginBottom: 4 }}>{row.label}</Text>
                <Text selectable style={{ fontSize: 16, fontWeight: "600", color: colors.onSurface }}>{row.value}</Text>
              </View>
            </View>
          ))}

          {/* Appearance */}
          <View className="px-4 py-3">
            <View className="flex-row items-center mb-2.5">
              <View className="w-10 items-center justify-center -ml-4">
                <Icon name={isDark ? "dark-mode" : "light-mode"} size={24} color={colors.outline} />
              </View>
              <View className="flex-1">
                <Text style={{ fontSize: 13, color: colors.outline }}>Appearance Mode</Text>
              </View>
            </View>

            <View
              style={{ backgroundColor: colors.surfaceContainerLow, borderColor: colors.divider, borderWidth: 1 }}
              className="flex-row rounded-xl p-1 gap-1"
            >
              {(["light", "dark", "system"] as ThemeMode[]).map((mode) => {
                const isSelected = themeMode === mode;
                const modeLabel = mode === "light" ? "Light" : mode === "dark" ? "Dark" : "System";
                const modeIcon = mode === "light" ? "light-mode" : mode === "dark" ? "dark-mode" : "settings-brightness";
                return (
                  <Pressable
                    key={mode}
                    onPress={() => setThemeMode(mode)}
                    style={{
                      backgroundColor: isSelected ? colors.surfaceContainerLowest : "transparent",
                      borderWidth: isSelected ? 1 : 0,
                      borderColor: isSelected ? colors.divider : "transparent",
                    }}
                    className={`flex-1 flex-row items-center justify-center py-2 px-2 rounded-lg gap-1.5 ${isSelected ? "shadow-xs" : "opacity-75"}`}
                  >
                    <Icon name={modeIcon as any} size={16} color={isSelected ? colors.primary : colors.outline} />
                    <Text style={{ fontSize: 12.5, fontWeight: "700", color: isSelected ? colors.primary : colors.outline }}>
                      {modeLabel}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Log out */}
          <Pressable onPress={confirmLogout} className="flex-row items-center px-4 py-3 mt-4 rounded-lg active:opacity-70">
            <View className="w-10 items-center justify-center">
              <Icon name="logout" size={24} color={isDark ? "#f87171" : "#dc2626"} />
            </View>
            <View style={{ borderBottomColor: colors.divider, borderBottomWidth: 1 }} className="flex-1 pb-3 pt-1">
              <Text style={{ fontSize: 16, fontWeight: "700", color: isDark ? "#f87171" : "#dc2626" }}>Log Out</Text>
            </View>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
