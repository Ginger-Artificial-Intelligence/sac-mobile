import { View, TextInput, Pressable, Platform, ScrollView, Keyboard, Image } from "react-native";
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
      router.replace("/");
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
              backgroundColor: isDark ? "#172435" : "#ffffff",
              borderColor: colors.divider,
              borderWidth: 1,
            }}
            className="w-18 h-18 rounded-2xl items-center justify-center mb-4 shadow-md overflow-hidden p-2"
          >
            <Image 
              source={IMAGE_PATHS.app_logo} 
              style={{ width: 56, height: 56, borderRadius: 10 }} 
              resizeMode="contain" 
            />
          </View>
          <Text style={{ fontSize: 30, fontWeight: "900", color: colors.onSurface }} className="tracking-tight">SAC Crm</Text>
          <Text style={{ color: colors.outline, fontSize: 14.5, marginTop: 4 }}>Enterprise Sales & Communication Sync</Text>
        </View>

        {/* Input Fields Card */}
        <View 
          style={{ 
            backgroundColor: colors.surfaceContainerLowest,
            borderColor: colors.divider,
            borderWidth: 1,
          }}
          className="rounded-2xl p-6 shadow-sm mb-6"
        >
          <Text style={{ fontSize: 20, fontWeight: "700", color: colors.onSurface, marginBottom: 20 }}>Log In</Text>

          {/* Email input field */}
          <View className="mb-4">
            <Text style={{ fontSize: 13.5, color: colors.outline, marginBottom: 8, fontWeight: "600" }}>Email Address</Text>
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
                      borderColor: errors.email ? "#ef4444" : colors.divider,
                      borderWidth: 1,
                      color: colors.onSurface,
                      fontSize: 15,
                    }}
                    className="w-full rounded-lg py-3.5 pl-10 pr-4 font-body-md"
                    placeholder="name@company.com"
                    placeholderTextColor={colors.outline}
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                </View>
              )}
            />
            {errors.email && (
              <Text className="text-red-500 text-xs mt-1">{errors.email.message}</Text>
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
                      borderColor: errors.password ? "#ef4444" : colors.divider,
                      borderWidth: 1,
                      color: colors.onSurface,
                      fontSize: 15,
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
              <Text className="text-red-500 text-xs mt-1">{errors.password.message}</Text>
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
            className="w-full py-3.5 rounded-xl items-center justify-center shadow-sm active:opacity-90"
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {isLoading && <LoadingSpinner size={20} color={colors.onPrimary} iconName="sync" />}
              <Text style={{ color: colors.onPrimary, fontWeight: "700", fontSize: 16 }}>
                {isLoading ? "Signing in…" : "Log In"}
              </Text>
            </View>
          </Pressable>
        </View>

        {/* Footer info */}
        <Text style={{ color: colors.outline, fontSize: 12.5 }} className="text-center mt-4">
          Demo login. Enter any valid email and a 6+ char password.
        </Text>
      </ScrollView>
    </View>
  );
}
