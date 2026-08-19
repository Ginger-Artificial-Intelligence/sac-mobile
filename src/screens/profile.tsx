import { ScrollView, View, Pressable, TextInput } from "react-native";
import { TopAppBar } from "../components/ui/TopAppBar";
import { Text } from "../components/ui/Text";
import { Icon } from "../components/ui/Icon";
import { Avatar } from "../components/ui/Avatar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useForm, Controller } from "react-hook-form";
import { useState } from "react";
import { useSyncStore } from "../store/syncStore";
import { useThemeStore, ThemeMode } from "../store/themeStore";

type ProfileForm = {
  name: string;
  role: string;
};

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const [isEditing, setIsEditing] = useState(false);
  const logout = useSyncStore((state) => state.logout);
  const themeMode = useThemeStore((state) => state.themeMode);
  const setThemeMode = useThemeStore((state) => state.setThemeMode);
  const isDark = useThemeStore((state) => state.isDark);
  const colors = useThemeStore((state) => state.colors);

  const { control, handleSubmit, reset } = useForm<ProfileForm>({
    defaultValues: {
      name: "Alex Mercer",
      role: "Senior Account Executive",
    }
  });

  const [profileData, setProfileData] = useState<ProfileForm>({
    name: "Alex Mercer",
    role: "Senior Account Executive",
  });

  const onSubmit = (data: ProfileForm) => {
    setProfileData(data);
    setIsEditing(false);
  };

  const handleCancel = () => {
    reset(profileData);
    setIsEditing(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView
        contentContainerStyle={{
          paddingBottom: 112 + Math.max(insets.bottom, 16),
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar Section */}
        <View className="items-center mt-6 mb-10">
          <View className="relative">
            <View 
              style={{
                backgroundColor: isDark ? "#172435" : "#dde3f9",
                borderColor: colors.surfaceContainerLowest,
                borderWidth: 4,
              }}
              className="w-40 h-40 rounded-full overflow-hidden shadow-sm items-center justify-center"
            >
               <Text style={{ color: colors.primary, fontSize: 56, fontWeight: "700" }}>{profileData.name.charAt(0)}</Text>
            </View>
            <Pressable 
              style={{
                backgroundColor: colors.primary,
                borderColor: colors.surfaceContainerLowest,
                borderWidth: 4,
              }}
              className="absolute bottom-2 right-2 w-12 h-12 rounded-full items-center justify-center shadow-md active:scale-95"
            >
              <Icon name="photo-camera" size={22} color={colors.onPrimary} />
            </Pressable>
          </View>
        </View>

        {/* Action Bar when Editing */}
        {isEditing && (
          <View className="flex-row justify-end gap-3 px-6 mb-4">
            <Pressable 
              onPress={handleCancel}
              style={{
                backgroundColor: colors.surfaceContainerLow,
                borderColor: colors.divider,
                borderWidth: 1,
              }}
              className="px-4 py-1.5 rounded-lg active:opacity-80"
            >
              <Text style={{ color: colors.onSurface, fontWeight: "600" }}>Cancel</Text>
            </Pressable>
            <Pressable 
              onPress={handleSubmit(onSubmit)}
              style={{ backgroundColor: colors.primary }}
              className="px-4 py-1.5 rounded-lg active:opacity-80"
            >
              <Text style={{ color: colors.onPrimary, fontWeight: "600" }}>Save</Text>
            </Pressable>
          </View>
        )}

        {/* Profile Details List */}
        <View className="px-2 space-y-1">
          {/* Name Field */}
          <Pressable 
            disabled={isEditing}
            onPress={() => setIsEditing(true)}
            className="flex-row items-center px-4 py-3 rounded-lg active:opacity-70 group"
          >
            <View className="w-10 items-center justify-center">
              <Icon name="person" size={24} color={colors.outline} />
            </View>
            <View style={{ borderBottomColor: colors.divider, borderBottomWidth: 1 }} className="flex-1 pb-3">
              <Text style={{ fontSize: 13, color: colors.outline, marginBottom: 4 }}>Name</Text>
              <View className="flex-row justify-between items-center">
                {isEditing ? (
                  <Controller
                    control={control}
                    name="name"
                    rules={{ required: true }}
                    render={({ field: { onChange, value } }) => (
                      <TextInput
                        style={{
                          backgroundColor: colors.surfaceContainerLow,
                          borderColor: colors.divider,
                          borderWidth: 1,
                          color: colors.onSurface,
                          fontSize: 16,
                        }}
                        className="flex-1 rounded-md px-2.5 py-1.5"
                        onChangeText={onChange}
                        value={value}
                      />
                    )}
                  />
                ) : (
                  <>
                    <Text style={{ fontSize: 16, fontWeight: "600", color: colors.onSurface }}>{profileData.name}</Text>
                    <Icon name="edit" size={18} color={colors.primary} />
                  </>
                )}
              </View>
            </View>
          </Pressable>

          {/* Role Field */}
          <Pressable 
            disabled={isEditing}
            onPress={() => setIsEditing(true)}
            className="flex-row items-start px-4 py-3 rounded-lg active:opacity-70 group"
          >
            <View className="w-10 items-center justify-center pt-1">
              <Icon name="work" size={24} color={colors.outline} />
            </View>
            <View style={{ borderBottomColor: colors.divider, borderBottomWidth: 1 }} className="flex-1 pb-3">
              <Text style={{ fontSize: 13, color: colors.outline, marginBottom: 4 }}>Role</Text>
              <View className="flex-row justify-between items-start">
                {isEditing ? (
                  <Controller
                    control={control}
                    name="role"
                    rules={{ required: true }}
                    render={({ field: { onChange, value } }) => (
                      <TextInput
                        style={{
                          backgroundColor: colors.surfaceContainerLow,
                          borderColor: colors.divider,
                          borderWidth: 1,
                          color: colors.onSurface,
                          fontSize: 16,
                        }}
                        className="flex-1 rounded-md px-2.5 py-1.5"
                        onChangeText={onChange}
                        value={value}
                      />
                    )}
                  />
                ) : (
                  <>
                    <Text style={{ fontSize: 16, fontWeight: "600", color: colors.onSurface }}>{profileData.role}</Text>
                    <Icon name="edit" size={18} color={colors.primary} style={{ marginTop: 2 }} />
                  </>
                )}
              </View>
            </View>
          </Pressable>

          {/* Appearance (Theme) Field */}
          <View className="px-4 py-3">
            <View className="flex-row items-center mb-2.5">
              <View className="w-10 items-center justify-center -ml-4">
                <Icon
                  name={isDark ? "dark-mode" : "light-mode"}
                  size={24}
                  color={colors.outline}
                />
              </View>
              <View className="flex-1">
                <Text style={{ fontSize: 13, color: colors.outline }}>Appearance Mode</Text>
              </View>
            </View>

            {/* Segmented Theme Picker */}
            <View 
              style={{
                backgroundColor: colors.surfaceContainerLow,
                borderColor: colors.divider,
                borderWidth: 1,
              }}
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
                    className={`flex-1 flex-row items-center justify-center py-2 px-2 rounded-lg gap-1.5 ${
                      isSelected ? "shadow-xs" : "opacity-75"
                    }`}
                  >
                    <Icon
                      name={modeIcon as any}
                      size={16}
                      color={isSelected ? colors.primary : colors.outline}
                    />
                    <Text
                      style={{
                        fontSize: 12.5,
                        fontWeight: "700",
                        color: isSelected ? colors.primary : colors.outline,
                      }}
                    >
                      {modeLabel}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Account Settings Field */}
          <Pressable className="flex-row items-center px-4 py-3 rounded-lg active:opacity-70 group">
            <View className="w-10 items-center justify-center">
              <Icon name="manage-accounts" size={24} color={colors.outline} />
            </View>
            <View style={{ borderBottomColor: colors.divider, borderBottomWidth: 1 }} className="flex-1 pb-3">
              <Text style={{ fontSize: 13, color: colors.outline, marginBottom: 4 }}>Settings</Text>
              <View className="flex-row justify-between items-center">
                <Text style={{ fontSize: 16, fontWeight: "600", color: colors.onSurface }}>Account Settings</Text>
                <Icon name="chevron-right" size={24} color={colors.outline} />
              </View>
            </View>
          </Pressable>

          {/* Notification Preferences Field */}
          <Pressable className="flex-row items-center px-4 py-3 rounded-lg active:opacity-70 group">
            <View className="w-10 items-center justify-center">
              <Icon name="notifications" size={24} color={colors.outline} />
            </View>
            <View style={{ borderBottomColor: colors.divider, borderBottomWidth: 1 }} className="flex-1 pb-3">
              <Text style={{ fontSize: 13, color: colors.outline, marginBottom: 4 }}>Preferences</Text>
              <View className="flex-row justify-between items-center">
                <Text style={{ fontSize: 16, fontWeight: "600", color: colors.onSurface }}>Notification Preferences</Text>
                <Icon name="chevron-right" size={24} color={colors.outline} />
              </View>
            </View>
          </Pressable>

          {/* Organization Info Field */}
          <Pressable className="flex-row items-center px-4 py-3 rounded-lg active:opacity-70 group">
            <View className="w-10 items-center justify-center">
              <Icon name="domain" size={24} color={colors.outline} />
            </View>
            <View style={{ borderBottomColor: colors.divider, borderBottomWidth: 1 }} className="flex-1 pb-3">
              <Text style={{ fontSize: 13, color: colors.outline, marginBottom: 4 }}>Organization</Text>
              <View className="flex-row justify-between items-center">
                <Text style={{ fontSize: 16, fontWeight: "600", color: colors.onSurface }}>Organization Info</Text>
                <Icon name="chevron-right" size={24} color={colors.outline} />
              </View>
            </View>
          </Pressable>

          {/* Security Field */}
          <Pressable className="flex-row items-center px-4 py-3 rounded-lg active:opacity-70 group">
            <View className="w-10 items-center justify-center">
              <Icon name="security" size={24} color={colors.outline} />
            </View>
            <View style={{ borderBottomColor: colors.divider, borderBottomWidth: 1 }} className="flex-1 pb-3">
              <Text style={{ fontSize: 13, color: colors.outline, marginBottom: 4 }}>Privacy</Text>
              <View className="flex-row justify-between items-center">
                <Text style={{ fontSize: 16, fontWeight: "600", color: colors.onSurface }}>Security</Text>
                <Icon name="chevron-right" size={24} color={colors.outline} />
              </View>
            </View>
          </Pressable>

          {/* Log Out Field */}
          <Pressable 
            onPress={logout}
            className="flex-row items-center px-4 py-3 mt-4 rounded-lg active:opacity-70 group"
          >
            <View className="w-10 items-center justify-center">
              <Icon name="logout" size={24} color={isDark ? "#f87171" : "#dc2626"} />
            </View>
            <View style={{ borderBottomColor: colors.divider, borderBottomWidth: 1 }} className="flex-1 pb-3 pt-1">
              <View className="flex-row justify-between items-center">
                <Text style={{ fontSize: 16, fontWeight: "700", color: isDark ? "#f87171" : "#dc2626" }}>Log Out</Text>
              </View>
            </View>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
