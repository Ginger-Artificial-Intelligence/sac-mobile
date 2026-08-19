import React, { useState, useRef } from "react";
import { View, TextInput, Pressable, Alert, Platform, ToastAndroid, Keyboard } from "react-native";
import { Icon } from "./Icon";
import { Text } from "./Text";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { CustomEmojiPicker } from "./CustomEmojiPicker";
import { useThemeStore } from "../../store/themeStore";

export interface ChatInputProps {
  onSend: (text: string) => void;
  insets: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  keyboardHeight: number;
  onPressTemplates: () => void;
}

export const ChatInput = React.memo(({ onSend, insets, keyboardHeight, onPressTemplates }: ChatInputProps) => {
  const [text, setText] = useState("");
  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetContent, setSheetContent] = useState<'media' | 'emoji' | null>(null);
  const inputRef = useRef<any>(null);
  const isDark = useThemeStore((state) => state.isDark);
  const colors = useThemeStore((state) => state.colors);

  const isEmojiActive = sheetVisible && sheetContent === 'emoji';
  const emojiIconName = isEmojiActive ? "keyboard" : "mood";

  const handleEmojiIconPress = () => {
    if (isEmojiActive) {
      inputRef.current?.focus();
    } else {
      handleToggleEmojiSheet();
    }
  };

  const handleSend = () => {
    if (text.trim().length === 0) return;
    onSend(text.trim());
    setText("");
  };

  const showToast = (msg: string) => {
    if (Platform.OS === "android") {
      ToastAndroid.show(msg, ToastAndroid.SHORT);
    } else {
      Alert.alert("", msg);
    }
  };

  const handlePickImageVideo = async () => {
    setSheetVisible(false);
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        showToast("Permissions required to access gallery.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        quality: 1,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        showToast(`Selected Media: ${file.fileName || "File"}`);
      }
    } catch (e) {
      console.warn("Picker error:", e);
      showToast("Failed to pick media.");
    }
  };

  const handlePickDocument = async () => {
    setSheetVisible(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        showToast(`Selected Doc: ${file.name}`);
      }
    } catch (e) {
      console.warn("Doc Picker error:", e);
      showToast("Failed to pick document.");
    }
  };

  const handlePickAudio = async () => {
    setSheetVisible(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "audio/*",
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        showToast(`Selected Audio: ${file.name}`);
      }
    } catch (e) {
      console.warn("Audio Picker error:", e);
      showToast("Failed to pick audio.");
    }
  };

  const handleToggleMediaSheet = () => {
    if (sheetVisible && sheetContent === 'media') {
      setSheetVisible(false);
    } else {
      Keyboard.dismiss();
      setSheetContent('media');
      setSheetVisible(true);
    }
  };

  const handleToggleEmojiSheet = () => {
    if (sheetVisible && sheetContent === 'emoji') {
      setSheetVisible(false);
    } else {
      Keyboard.dismiss();
      setSheetContent('emoji');
      setSheetVisible(true);
    }
  };

  const options = [
    { label: "Templates", icon: "assignment", color: "#0ea5e9", onPress: () => { setSheetVisible(false); onPressTemplates(); } },
    { label: "Image/Video", icon: "photo-library", color: "#10b981", onPress: handlePickImageVideo },
    { label: "Documents", icon: "insert-drive-file", color: "#dc2626", onPress: handlePickDocument },
    { label: "Audio", icon: "audiotrack", color: "#eab308", onPress: handlePickAudio },
    { label: "Send Location", icon: "place", color: "#22c55e", onPress: () => { setSheetVisible(false); showToast("Send Location selected"); } },
    { label: "Request Location", icon: "my-location", color: "#a855f7", onPress: () => { setSheetVisible(false); showToast("Request Location selected"); } },
    { label: "Request Address", icon: "home", color: "#ec4899", onPress: () => { setSheetVisible(false); showToast("Request Address selected"); } },
  ];

  return (
    <View 
      style={{
        backgroundColor: isDark ? "#0b121c" : "#ffffff",
        borderTopColor: colors.divider,
        borderTopWidth: 1,
      }}
      className="flex-col shrink-0 z-20"
    >
      {/* Backdrop overlay to dismiss sheet on tapping messages list */}
      {sheetVisible && (
        <Pressable
          onPress={() => setSheetVisible(false)}
          style={{
            position: "absolute",
            bottom: "100%",
            left: -50,
            right: -50,
            height: 2000,
            backgroundColor: sheetContent === 'media' ? (isDark ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.15)") : "transparent",
            zIndex: 1,
          }}
        />
      )}

      {/* Chat Input Row */}
      <View
        className="px-2 py-2 flex-row items-end gap-2 z-10"
        style={{ paddingBottom: keyboardHeight > 0 ? 20 : (sheetVisible ? 8 : Math.max(insets.bottom, 8)) }}
      >
        <View 
          style={{
            backgroundColor: colors.surfaceContainerLowest,
            borderColor: colors.divider,
            borderWidth: 1,
          }}
          className="flex-1 rounded-[22px] flex-row items-center px-2 py-1 min-h-[44px]"
        >
          <Pressable onPress={handleEmojiIconPress} className="p-2 rounded-full active:opacity-70">
            <Icon name={emojiIconName} size={24} color={colors.outline} />
          </Pressable>
          <TextInput
            ref={inputRef}
            style={{ 
              maxHeight: 120,
              color: colors.onSurface,
              fontSize: 15,
            }}
            className="flex-1 bg-transparent py-2 px-1 font-body-md"
            placeholder="Message"
            placeholderTextColor={colors.outline}
            multiline
            value={text}
            onChangeText={setText}
            onFocus={() => setSheetVisible(false)}
          />
          <Pressable onPress={handleToggleMediaSheet} className="p-2 rounded-full active:opacity-70">
            <Icon name="attach-file" size={24} color={colors.outline} />
          </Pressable>
          <Pressable className="p-2 rounded-full active:opacity-70">
            <Icon name="photo-camera" size={24} color={colors.outline} />
          </Pressable>
        </View>

        <Pressable
          onPress={handleSend}
          style={{ backgroundColor: colors.primary }}
          className="w-11 h-11 rounded-full items-center justify-center shadow-md active:opacity-80"
        >
          <Icon
            name={text.trim().length > 0 ? "send" : "mic"}
            size={24}
            color={colors.onPrimary}
          />
        </Pressable>
      </View>

      {/* Attachment Media Sheet */}
      {sheetVisible && sheetContent === 'media' && (
        <View 
          style={{ 
            paddingBottom: Math.max(insets.bottom, 24),
            backgroundColor: colors.surfaceContainerLowest,
            borderTopColor: colors.divider,
            borderTopWidth: 1,
          }}
          className="p-5 pb-8 z-10"
        >
          <View 
            style={{ backgroundColor: isDark ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.15)" }}
            className="w-12 h-1 rounded-full self-center mb-5" 
          />

          <View className="flex-row flex-wrap justify-start gap-y-4">
            {options.map((opt, idx) => (
              <Pressable
                key={idx}
                onPress={opt.onPress}
                className="items-center justify-center w-[25%] active:opacity-70"
              >
                <View 
                  style={{ backgroundColor: opt.color }}
                  className="w-12 h-12 rounded-full items-center justify-center shadow-xs"
                >
                  <Icon name={opt.icon as any} size={22} color="#fff" />
                </View>
                <Text 
                  style={{ fontSize: 11, color: colors.outline, fontWeight: "600" }}
                  className="text-center mt-2 px-1"
                  numberOfLines={2}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Emoji Picker Sheet */}
      {sheetVisible && sheetContent === 'emoji' && (
        <CustomEmojiPicker
          onSelect={(emoji) => setText(prev => prev + emoji)}
          insetsBottom={insets.bottom}
        />
      )}
    </View>
  );
});
