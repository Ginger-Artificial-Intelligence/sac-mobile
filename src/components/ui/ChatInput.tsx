import React, { useState } from "react";
import { View, TextInput, Pressable, Alert, Platform, ToastAndroid, Keyboard } from "react-native";
import { Icon } from "./Icon";
import { Text } from "./Text";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";

export interface ChatInputProps {
  onSend: (text: string) => void;
  insets: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  keyboardHeight: number;
}

export const ChatInput = React.memo(({ onSend, insets, keyboardHeight }: ChatInputProps) => {
  const [text, setText] = useState("");
  const [sheetVisible, setSheetVisible] = useState(false);

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
        type: [
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/vnd.ms-excel",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-powerpoint",
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          "text/plain"
        ],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        showToast(`Selected Document: ${file.name}`);
      }
    } catch (e) {
      console.warn("Picker error:", e);
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
      console.warn("Picker error:", e);
      showToast("Failed to pick audio.");
    }
  };

  const handleToggleSheet = () => {
    if (!sheetVisible) {
      Keyboard.dismiss();
    }
    setSheetVisible(!sheetVisible);
  };

  const options = [
    { label: "Templates", icon: "assignment", color: "#0ea5e9", onPress: () => { setSheetVisible(false); showToast("Templates selected"); } },
    { label: "Image/Video", icon: "photo-library", color: "#10b981", onPress: handlePickImageVideo },
    { label: "Documents", icon: "insert-drive-file", color: "#dc2626", onPress: handlePickDocument },
    { label: "Audio", icon: "audiotrack", color: "#eab308", onPress: handlePickAudio },
    { label: "Send Location", icon: "place", color: "#22c55e", onPress: () => { setSheetVisible(false); showToast("Send Location selected"); } },
    { label: "Request Location", icon: "my-location", color: "#a855f7", onPress: () => { setSheetVisible(false); showToast("Request Location selected"); } },
    { label: "Request Address", icon: "home", color: "#ec4899", onPress: () => { setSheetVisible(false); showToast("Request Address selected"); } },
  ];

  return (
    <View className="bg-surface border-t border-outline-variant/30 flex-col shrink-0 z-20">
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
            backgroundColor: "rgba(0,0,0,0.15)",
            zIndex: 1,
          }}
        />
      )}

      {/* Chat Input Row */}
      <View
        className="px-2 py-2 flex-row items-end gap-2 z-10"
        style={{ paddingBottom: sheetVisible || keyboardHeight > 0 ? 8 : Math.max(insets.bottom, 8) }}
      >
        <View className="flex-1 bg-surface-container-lowest border border-outline-variant/50 rounded-[22px] flex-row items-center px-2 py-1 min-h-[44px]">
          <Pressable className="p-2 rounded-full active:opacity-70">
            <Icon name="mood" size={24} className="text-on-surface-variant" />
          </Pressable>
          <TextInput
            className="flex-1 bg-transparent py-2 px-1 font-body-md text-on-surface"
            placeholder="Message"
            placeholderTextColor="#737782"
            multiline
            value={text}
            onChangeText={setText}
            onFocus={() => setSheetVisible(false)}
            style={{ maxHeight: 120 }}
          />
          <Pressable onPress={handleToggleSheet} className="p-2 rounded-full active:opacity-70">
            <Icon name="attach-file" size={24} className="text-on-surface-variant" />
          </Pressable>
          <Pressable className="p-2 rounded-full active:opacity-70">
            <Icon name="photo-camera" size={24} className="text-on-surface-variant" />
          </Pressable>
        </View>

        <Pressable
          onPress={handleSend}
          className="bg-primary-container w-11 h-11 rounded-full items-center justify-center shadow-md active:opacity-80"
        >
          <Icon
            name={text.trim().length > 0 ? "send" : "mic"}
            size={24}
            className="text-on-primary-container"
          />
        </Pressable>
      </View>

      {/* Attachment Sheet (Inline below the input row) */}
      {sheetVisible && (
        <View 
          className="bg-surface border-t border-outline-variant/20 p-5 pb-8 z-10"
          style={{ paddingBottom: Math.max(insets.bottom, 24) }}
        >
          <View className="w-12 h-1 bg-outline-variant/40 rounded-full self-center mb-5" />

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
                  className="text-[11px] text-on-surface-variant text-center font-semibold mt-2 px-1"
                  numberOfLines={2}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </View>
  );
});
