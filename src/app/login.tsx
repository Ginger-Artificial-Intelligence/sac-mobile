import { View, TextInput, Pressable, Platform, ScrollView, Keyboard } from "react-native";
import { useRouter } from "expo-router";
import { Text } from "../components/ui/Text";
import { Icon } from "../components/ui/Icon";
import { LoadingSpinner } from "../components/ui/Loading";
import { useForm, Controller } from "react-hook-form";
import { useSyncStore } from "../store/syncStore";
import { useState, useEffect } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type LoginForm = {
  email: string;
  password?: string;
};

export default function LoginScreen() {
  const router = useRouter();
  const login = useSyncStore((state) => state.login);
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
    <View className="flex-1 bg-surface">
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
          <View className="w-16 h-16 bg-primary rounded-2xl items-center justify-center mb-4 shadow-md">
            <Icon name="rocket-launch" size={32} color="#ffffff" />
          </View>
          <Text className="text-3xl font-black text-on-surface tracking-tight">SAC Crm</Text>
          <Text className="text-on-surface-variant font-body-md mt-1">Enterprise Sales & Communication Sync</Text>
        </View>

        {/* Input Fields Card */}
        <View className="bg-surface-container-low border border-outline-variant/30 rounded-2xl p-6 shadow-sm mb-6">
          <Text className="text-xl font-bold text-on-surface mb-6">Log In</Text>

          {/* Email input field */}
          <View className="mb-4">
            <Text className="font-label-lg text-on-surface-variant mb-2">Email Address</Text>
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
                    <Icon name="email" size={20} className="text-outline" />
                  </View>
                  <TextInput
                    className={`w-full bg-surface-container rounded-lg py-3.5 pl-10 pr-4 font-body-md text-on-surface border ${errors.email ? 'border-error' : 'border-outline-variant/20'}`}
                    placeholder="name@company.com"
                    placeholderTextColor="#737782"
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
              <Text className="text-error font-caption mt-1">{errors.email.message}</Text>
            )}
          </View>

          {/* Password input field */}
          <View className="mb-6">
            <Text className="font-label-lg text-on-surface-variant mb-2">Password</Text>
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
                    <Icon name="lock" size={20} className="text-outline" />
                  </View>
                  <TextInput
                    className={`w-full bg-surface-container rounded-lg py-3.5 pl-10 pr-12 font-body-md text-on-surface border ${errors.password ? 'border-error' : 'border-outline-variant/20'}`}
                    placeholder="••••••••"
                    placeholderTextColor="#737782"
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
                      className="text-outline" 
                    />
                  </Pressable>
                </View>
              )}
            />
            {errors.password && (
              <Text className="text-error font-caption mt-1">{errors.password.message}</Text>
            )}
          </View>

          {/* Submit Action Button */}
          <Pressable 
            onPress={handleSubmit(onSubmit)}
            disabled={isLoading}
            className="w-full bg-primary py-3.5 rounded-xl items-center justify-center shadow-sm active:opacity-90"
            style={{ opacity: isLoading ? 0.8 : 1 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {isLoading && <LoadingSpinner size={20} color="#ffffff" iconName="sync" />}
              <Text className="text-on-primary font-bold font-body-lg">
                {isLoading ? "Signing in…" : "Log In"}
              </Text>
            </View>
          </Pressable>
        </View>

        {/* Footer info */}
        <Text className="text-center font-caption text-on-surface-variant mt-4">
          Demo login. Enter any valid email and a 6+ char password.
        </Text>
      </ScrollView>
    </View>
  );
}
