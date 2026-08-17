import { ScrollView, View, Pressable, TextInput } from "react-native";
import { TopAppBar } from "../components/ui/TopAppBar";
import { Text } from "../components/ui/Text";
import { Icon } from "../components/ui/Icon";
import { Avatar } from "../components/ui/Avatar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useForm, Controller } from "react-hook-form";
import { useState } from "react";
import { useSyncStore } from "../store/syncStore";

type ProfileForm = {
  name: string;
  role: string;
};

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const [isEditing, setIsEditing] = useState(false);
  const logout = useSyncStore((state) => state.logout);

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
    <View className="flex-1 bg-surface">
      <ScrollView
        contentContainerStyle={{
          paddingBottom: 112 + Math.max(insets.bottom, 16),
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar Section */}
        <View className="items-center mt-6 mb-10">
          <View className="relative">
            <View className="w-40 h-40 rounded-full overflow-hidden border-4 border-surface-container-lowest shadow-sm bg-primary-container items-center justify-center">
               <Text className="text-on-primary-container text-6xl">{profileData.name.charAt(0)}</Text>
            </View>
            <Pressable className="absolute bottom-2 right-2 w-12 h-12 bg-secondary rounded-full items-center justify-center shadow-md border-4 border-surface-container-lowest active:scale-95">
              <Icon name="photo-camera" size={24} className="text-on-secondary" />
            </Pressable>
          </View>
        </View>

        {/* Action Bar when Editing */}
        {isEditing && (
          <View className="flex-row justify-end gap-3 px-6 mb-4">
            <Pressable 
              onPress={handleCancel}
              className="bg-surface-container border border-outline-variant px-4 py-1.5 rounded-lg active:opacity-80"
            >
              <Text className="font-label-lg text-on-surface">Cancel</Text>
            </Pressable>
            <Pressable 
              onPress={handleSubmit(onSubmit)}
              className="bg-primary px-4 py-1.5 rounded-lg active:opacity-80"
            >
              <Text className="font-label-lg text-on-primary">Save</Text>
            </Pressable>
          </View>
        )}

        {/* Profile Details List */}
        <View className="px-2 space-y-1">
          {/* Name Field */}
          <Pressable 
            disabled={isEditing}
            onPress={() => setIsEditing(true)}
            className="flex-row items-center px-4 py-3 rounded-lg active:bg-surface-container-low group"
          >
            <View className="w-10 items-center justify-center">
              <Icon name="person" size={24} className="text-on-surface-variant" />
            </View>
            <View className="flex-1 border-b border-outline-variant/30 pb-3">
              <Text className="font-label-md text-on-surface-variant mb-1">Name</Text>
              <View className="flex-row justify-between items-center">
                {isEditing ? (
                  <Controller
                    control={control}
                    name="name"
                    rules={{ required: true }}
                    render={({ field: { onChange, value } }) => (
                      <TextInput
                        className="flex-1 bg-surface-container-low border border-outline-variant rounded-md px-2 py-1.5 text-on-surface font-body-lg"
                        onChangeText={onChange}
                        value={value}
                      />
                    )}
                  />
                ) : (
                  <>
                    <Text className="font-body-lg">{profileData.name}</Text>
                    <Icon name="edit" size={18} className="text-primary" />
                  </>
                )}
              </View>
            </View>
          </Pressable>

          {/* Role Field */}
          <Pressable 
            disabled={isEditing}
            onPress={() => setIsEditing(true)}
            className="flex-row items-start px-4 py-3 rounded-lg active:bg-surface-container-low group"
          >
            <View className="w-10 items-center justify-center pt-1">
              <Icon name="work" size={24} className="text-on-surface-variant" />
            </View>
            <View className="flex-1 border-b border-outline-variant/30 pb-3">
              <Text className="font-label-md text-on-surface-variant mb-1">Role</Text>
              <View className="flex-row justify-between items-start">
                {isEditing ? (
                  <Controller
                    control={control}
                    name="role"
                    rules={{ required: true }}
                    render={({ field: { onChange, value } }) => (
                      <TextInput
                        className="flex-1 bg-surface-container-low border border-outline-variant rounded-md px-2 py-1.5 text-on-surface font-body-lg"
                        onChangeText={onChange}
                        value={value}
                      />
                    )}
                  />
                ) : (
                  <>
                    <Text className="font-body-lg">{profileData.role}</Text>
                    <Icon name="edit" size={18} className="text-primary mt-0.5" />
                  </>
                )}
              </View>
            </View>
          </Pressable>

          {/* Account Settings Field */}
          <Pressable className="flex-row items-center px-4 py-3 rounded-lg active:bg-surface-container-low group">
            <View className="w-10 items-center justify-center">
              <Icon name="manage-accounts" size={24} className="text-on-surface-variant" />
            </View>
            <View className="flex-1 border-b border-outline-variant/30 pb-3">
              <Text className="font-label-md text-on-surface-variant mb-1">Settings</Text>
              <View className="flex-row justify-between items-center">
                <Text className="font-body-lg">Account Settings</Text>
                <Icon name="chevron-right" size={24} className="text-outline" />
              </View>
            </View>
          </Pressable>

          {/* Notification Preferences Field */}
          <Pressable className="flex-row items-center px-4 py-3 rounded-lg active:bg-surface-container-low group">
            <View className="w-10 items-center justify-center">
              <Icon name="notifications" size={24} className="text-on-surface-variant" />
            </View>
            <View className="flex-1 border-b border-outline-variant/30 pb-3">
              <Text className="font-label-md text-on-surface-variant mb-1">Preferences</Text>
              <View className="flex-row justify-between items-center">
                <Text className="font-body-lg">Notification Preferences</Text>
                <Icon name="chevron-right" size={24} className="text-outline" />
              </View>
            </View>
          </Pressable>

          {/* Organization Info Field */}
          <Pressable className="flex-row items-center px-4 py-3 rounded-lg active:bg-surface-container-low group">
            <View className="w-10 items-center justify-center">
              <Icon name="domain" size={24} className="text-on-surface-variant" />
            </View>
            <View className="flex-1 border-b border-outline-variant/30 pb-3">
              <Text className="font-label-md text-on-surface-variant mb-1">Organization</Text>
              <View className="flex-row justify-between items-center">
                <Text className="font-body-lg">Organization Info</Text>
                <Icon name="chevron-right" size={24} className="text-outline" />
              </View>
            </View>
          </Pressable>

          {/* Security Field */}
          <Pressable className="flex-row items-center px-4 py-3 rounded-lg active:bg-surface-container-low group">
            <View className="w-10 items-center justify-center">
              <Icon name="security" size={24} className="text-on-surface-variant" />
            </View>
            <View className="flex-1 border-b border-outline-variant/30 pb-3">
              <Text className="font-label-md text-on-surface-variant mb-1">Privacy</Text>
              <View className="flex-row justify-between items-center">
                <Text className="font-body-lg">Security</Text>
                <Icon name="chevron-right" size={24} className="text-outline" />
              </View>
            </View>
          </Pressable>

          {/* Log Out Field */}
          <Pressable 
            onPress={logout}
            className="flex-row items-center px-4 py-3 mt-4 rounded-lg active:bg-error-container/50 group"
          >
            <View className="w-10 items-center justify-center">
              <Icon name="logout" size={24} className="text-error" />
            </View>
            <View className="flex-1 pb-3 pt-1 border-b border-outline-variant/30">
              <View className="flex-row justify-between items-center">
                <Text className="font-body-lg text-error">Log Out</Text>
              </View>
            </View>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
