import { View, TextInput, Pressable, Platform, ScrollView, Keyboard, Image, Linking } from "react-native";
import { useRouter } from "expo-router";
import { Text } from "../components/ui/Text";
import { Icon } from "../components/ui/Icon";
import { LoadingSpinner } from "../components/ui/Loading";
import { useForm, Controller } from "react-hook-form";
import { useSyncStore } from "../store/syncStore";
import { useThemeStore } from "../store/themeStore";
import { useState, useEffect } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IMAGE_PATHS } from "../constants/imagePaths";

const SUPPORT_REGIONS = [
  { region: "India", phone: "+91 80897 68686" },
  { region: "Qatar", phone: "+974 7009 7100" },
];

type LoginForm = {
  email: string;
  password?: string;
};

export default function LoginScreen() {
  const router = useRouter();
  const login = useSyncStore((state) => state.login);
  const isDark = useThemeStore((state) => state.isDark);
  const colors = useThemeStore((state) => state.colors);
  const insets = useSafeAreaInsets();
  const [showPassword, setShowPassword] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const { control, handleSubmit, setError, formState: { errors } } = useForm<LoginForm>({
    defaultValues: {
      email: "",
      password: "",
    }
  });

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    try {
      await login(data.email, data.password);
      router.replace("/sync");
    } catch (err: any) {
      setError("email", { type: "manual", message: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + 40,
          paddingBottom: insets.bottom + 20 + keyboardHeight,
          paddingHorizontal: 24,
          justifyContent: 'center',
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Branding header logo */}
        <View className="items-center mb-10">
          <View
            style={{
              backgroundColor: colors.surfaceContainerLow,
            }}
            className="w-18 h-18 rounded-2xl items-center justify-center mb-4 overflow-hidden p-2"
          >
            <Image
              source={IMAGE_PATHS.app_logo}
              style={{ width: 56, height: 56, borderRadius: 10 }}
              resizeMode="contain"
            />
          </View>
          <Text style={{ fontSize: 30, lineHeight: 36, fontWeight: "800", color: colors.primary }} className="tracking-tight">SAC CRM</Text>
          <Text style={{ color: colors.outline, fontSize: 14.5, marginTop: 4 }}>Enterprise Sales & Communication Sync</Text>
        </View>

        {/* Input Fields Card */}
        <View
          style={{
            backgroundColor: colors.surface,
          }}
          className="mb-6"
        >
          <Text style={{ fontSize: 20, fontWeight: "700", color: colors.onSurface, marginBottom: 20 }}>Log in</Text>

          {/* Email input field */}
          <View className="mb-4">
            <Text style={{ fontSize: 13.5, color: colors.outline, marginBottom: 8, fontWeight: "600" }}>Email address</Text>
            <Controller
              control={control}
              name="email"
              rules={{
                required: "Email is required",
                pattern: {
                  value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                  message: "Invalid email address"
                }
              }}
              render={({ field: { onChange, onBlur, value } }) => (
                <View className="relative justify-center">
                  <View className="absolute left-3 z-10">
                    <Icon name="email" size={20} color={colors.outline} />
                  </View>
                  <TextInput
                    style={{
                      backgroundColor: colors.surfaceContainerLow,
                      borderColor: errors.email ? colors.error : "transparent",
                      borderWidth: 1.5,
                      color: colors.onSurface,
                      fontSize: 16,
                      fontFamily: "PlusJakartaSans_400Regular",
                    }}
                    className="w-full rounded-xl py-3.5 pl-10 pr-4 font-body-md"
                    accessibilityLabel="Email address"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                  {/* The native placeholder ignores the app font on some Samsung phones, so it is drawn as Text */}
                  {!value && (
                    <Text pointerEvents="none" numberOfLines={1} style={{ position: "absolute", left: 40, right: 16, fontSize: 16, color: colors.outline }}>
                      name@company.com
                    </Text>
                  )}
                </View>
              )}
            />
            {errors.email && (
              <Text style={{ color: colors.error, fontSize: 12.5, marginTop: 4 }}>{errors.email.message}</Text>
            )}
          </View>

          {/* Password input field */}
          <View className="mb-6">
            <Text style={{ fontSize: 13.5, color: colors.outline, marginBottom: 8, fontWeight: "600" }}>Password</Text>
            <Controller
              control={control}
              name="password"
              rules={{
                required: "Password is required",
                minLength: {
                  value: 6,
                  message: "Password must be at least 6 characters"
                }
              }}
              render={({ field: { onChange, onBlur, value } }) => (
                <View className="relative justify-center">
                  <View className="absolute left-3 z-10">
                    <Icon name="lock" size={20} color={colors.outline} />
                  </View>
                  <TextInput
                    style={{
                      backgroundColor: colors.surfaceContainerLow,
                      borderColor: errors.password ? colors.error : "transparent",
                      borderWidth: 1.5,
                      color: colors.onSurface,
                      fontSize: 16,
                      fontFamily: "PlusJakartaSans_400Regular",
                    }}
                    className="w-full rounded-lg py-3.5 pl-10 pr-12 font-body-md"
                    placeholder="••••••••"
                    placeholderTextColor={colors.outline}
                    secureTextEntry={!showPassword}
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    autoCapitalize="none"
                  />
                  <Pressable
                    className="absolute right-3 p-1 rounded-full active:opacity-75"
                    onPress={() => setShowPassword(!showPassword)}
                  >
                    <Icon
                      name={showPassword ? "visibility-off" : "visibility"}
                      size={20}
                      color={colors.outline}
                    />
                  </Pressable>
                </View>
              )}
            />
            {errors.password && (
              <Text style={{ color: colors.error, fontSize: 12.5, marginTop: 4 }}>{errors.password.message}</Text>
            )}
          </View>

          {/* Submit Action Button */}
          <Pressable
            onPress={handleSubmit(onSubmit)}
            disabled={isLoading}
            style={{
              backgroundColor: colors.primary,
              opacity: isLoading ? 0.8 : 1,
            }}
            className="w-full py-4 rounded-full items-center justify-center active:opacity-90"
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {isLoading && <LoadingSpinner size={20} color={colors.onPrimary} iconName="sync" />}
              <Text style={{ color: colors.onPrimary, fontWeight: "700", fontSize: 16 }}>
                {isLoading ? "Signing in…" : "Log in"}
              </Text>
            </View>
          </Pressable>
        </View>

        {/* Support contacts: tap a region to call it */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8, marginBottom: 14 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.divider }} />
          <Text style={{ color: colors.outline, fontSize: 12, fontWeight: "600", letterSpacing: 1 }}>SUPPORT REGIONS</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.divider }} />
        </View>
        <View style={{ flexDirection: "row", gap: 12 }}>
          {SUPPORT_REGIONS.map((r) => (
            <Pressable
              key={r.region}
              onPress={() => Linking.openURL(`tel:${r.phone.replace(/[^\d+]/g, "")}`).catch(() => {})}
              accessibilityRole="button"
              accessibilityLabel={`Call ${r.region} support, ${r.phone}`}
              className="active:opacity-70"
              style={{ flex: 1, minHeight: 64, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.surfaceContainerLow, borderWidth: 1, borderColor: colors.outlineVariant }}
            >
              <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "700", letterSpacing: 0.4 }}>{r.region.toUpperCase()}</Text>
              <Text style={{ color: colors.onSurfaceVariant, fontSize: 14, marginTop: 6 }}>{r.phone}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
