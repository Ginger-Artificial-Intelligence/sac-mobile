import React, { useEffect, useState, useRef } from "react";
import { View, TextInput, Pressable, Alert, Platform, ToastAndroid, Keyboard } from "react-native";
import { Icon } from "./Icon";
import { Text } from "./Text";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { CustomEmojiPicker, warmEmojiData } from "./CustomEmojiPicker";
import { VoiceRecorderBar } from "./VoiceRecorderBar";
import { MediaPreviewModal, type PreviewResult } from "../chat/MediaPreviewModal";
import { useThemeStore } from "../../store/themeStore";
import { mediaSizeError } from "../../lib/chatWindow";
import type { PickedMedia } from "../../lib/mediaUpload";

export interface ReplyingToMessage {
  id: string;
  messageId?: string;
  messageOgId: string;
  senderName: string;
  text: string;
  type: string;
  mediaUrl?: string;
  fileName?: string;
  uploaded_id?: string;
  isOutgoing?: boolean;
}

export interface ChatInputProps {
  onSend: (text: string, replyTo?: ReplyingToMessage | null) => void;
  /** An image, video, document, audio file or voice note (already uploaded by the store after this) */
  onSendMedia: (media: PickedMedia, caption: string, replyTo?: ReplyingToMessage | null) => void;
  insets: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  keyboardHeight: number;
  onPressTemplates: () => void;
  replyingTo?: ReplyingToMessage | null;
  onCancelReply?: () => void;
  /** whatsapp | messenger | instagram: decides which attach options exist */
  channel?: string;
  isGroup?: boolean;
  /** WhatsApp 24-hour window is closed: free text is locked unless Direct Send is on, files are locked */
  windowClosed?: boolean;
  /** When the customer last wrote (ms), shown in the window banner */
  lastCustomerAt?: number | null;
  directSend?: boolean;
  onToggleDirectSend?: (on: boolean) => void;
  /** When set, the composer is replaced by this notice (e.g. group suspended or deleted) */
  groupNotice?: string | null;
  /** Opens the send-location / request-location / request-address sheet */
  onOpenSpecial?: (mode: "location" | "requestLocation" | "requestAddress") => void;
}

const formatAgo = (ms: number) => {
  const mins = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
};

export const ChatInput = React.memo(({
  onSend,
  onSendMedia,
  insets,
  keyboardHeight,
  onPressTemplates,
  replyingTo = null,
  onCancelReply,
  channel = "whatsapp",
  isGroup = false,
  windowClosed = false,
  lastCustomerAt = null,
  directSend = false,
  onToggleDirectSend,
  groupNotice = null,
  onOpenSpecial,
}: ChatInputProps) => {
  const [text, setText] = useState("");
  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetContent, setSheetContent] = useState<'media' | 'emoji' | null>(null);
  const [recording, setRecording] = useState(false);
  const inputRef = useRef<any>(null);
  const isDark = useThemeStore((state) => state.isDark);
  const colors = useThemeStore((state) => state.colors);

  // Load the emoji data a moment after the chat opens, off the critical path, so the picker opens fast
  useEffect(() => {
    const t = setTimeout(warmEmojiData, 1500);
    return () => clearTimeout(t);
  }, []);

  const isEmojiActive = sheetVisible && sheetContent === 'emoji';
  const emojiIconName = isEmojiActive ? "keyboard" : "mood";

  const isWhatsApp = channel === "whatsapp";
  const isInstagram = channel === "instagram";
  const composerLocked = windowClosed && !directSend; // free text
  const mediaLocked = windowClosed; // files, camera and voice need an open window even with Direct Send

  const showToast = (msg: string) => {
    if (Platform.OS === "android") {
      ToastAndroid.show(msg, ToastAndroid.SHORT);
    } else {
      Alert.alert("", msg);
    }
  };

  const lockedPress = () => {
    setSheetVisible(false);
    showToast(mediaLocked && directSend ? "Files need an open 24-hour window: send a template instead" : "24-hour window closed: send a template or turn on Direct Send");
  };

  const handleEmojiIconPress = () => {
    if (isEmojiActive) {
      inputRef.current?.focus();
    } else {
      handleToggleEmojiSheet();
    }
  };

  const handleSend = () => {
    if (composerLocked || text.trim().length === 0) return;
    onSend(text.trim(), replyingTo);
    setText("");
  };

  // ── Attachments ─────────────────────────────────────────────────────────────
  // The text in the box becomes the caption of the first file; then the box is cleared
  // Picked files open the preview first (caption, edit, remove), then go out from there
  const [preview, setPreview] = useState<PickedMedia[] | null>(null);

  const sendPicked = (items: PickedMedia[]) => {
    const ok = items.filter((media) => {
      const tooBig = mediaSizeError(channel, media.kind, media.size);
      if (tooBig) Alert.alert("File too large", `${media.name}: ${tooBig}`);
      return !tooBig;
    });
    if (ok.length > 0) setPreview(ok);
  };

  const confirmPreview = (results: PreviewResult[]) => {
    setPreview(null);
    for (const r of results) onSendMedia(r.media, r.caption, replyingTo);
    setText("");
  };

  const fromImageAsset = (a: ImagePicker.ImagePickerAsset): PickedMedia => {
    const isVideo = a.type === "video";
    return {
      kind: isVideo ? "video" : "image",
      uri: a.uri,
      name: a.fileName || `${isVideo ? "video" : "photo"}-${Date.now()}.${isVideo ? "mp4" : "jpg"}`,
      mimeType: a.mimeType || (isVideo ? "video/mp4" : "image/jpeg"),
      size: a.fileSize ?? null,
      width: a.width,
      height: a.height,
    };
  };

  const handlePickImageVideo = async () => {
    setSheetVisible(false);
    if (mediaLocked) return lockedPress();
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        showToast("Allow access to your photos to attach them.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        quality: 0.8,
        allowsMultipleSelection: true,
        selectionLimit: 10,
      });
      if (!result.canceled && result.assets?.length) sendPicked(result.assets.map(fromImageAsset));
    } catch (e) {
      console.warn("Picker error:", e);
      showToast("Could not open your photos.");
    }
  };

  const handleCamera = async () => {
    setSheetVisible(false);
    Keyboard.dismiss();
    if (mediaLocked) return lockedPress();
    try {
      try {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted && perm.canAskAgain === false) {
          showToast("Allow camera access in your phone settings.");
          return;
        }
      } catch {
        /* some builds have no camera permission to ask for: the system camera still opens */
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images", "videos"], quality: 0.8, videoMaxDuration: 60 });
      if (!result.canceled && result.assets?.length) sendPicked(result.assets.map(fromImageAsset));
    } catch (e) {
      console.warn("Camera error:", e);
      showToast("Could not open the camera.");
    }
  };

  const pickFile = async (kind: "document" | "audio") => {
    setSheetVisible(false);
    if (mediaLocked) return lockedPress();
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: kind === "audio" ? "audio/*" : "*/*",
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const f = result.assets[0];
      sendPicked([
        {
          kind,
          uri: f.uri,
          name: f.name || (kind === "audio" ? "audio" : "document"),
          mimeType: f.mimeType || (kind === "audio" ? "audio/mpeg" : "application/octet-stream"),
          size: f.size ?? null,
        },
      ]);
    } catch (e) {
      console.warn("File picker error:", e);
      showToast("Could not open the file picker.");
    }
  };

  const startVoice = () => {
    if (mediaLocked) return lockedPress();
    Keyboard.dismiss();
    setSheetVisible(false);
    setRecording(true);
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

  // Which options exist depends on the channel (WhatsApp templates, locations and Direct Send are
  // WhatsApp-only; Instagram has no documents) and, for WhatsApp, on the 24-hour window.
  const options = [
    ...(isWhatsApp
      ? [{ label: "Templates", icon: "assignment", color: "#0ea5e9", disabled: false, onPress: () => { setSheetVisible(false); onPressTemplates(); } }]
      : []),
    { label: "Camera", icon: "photo-camera", color: "#ef4444", disabled: mediaLocked, onPress: handleCamera },
    { label: "Image/Video", icon: "photo-library", color: "#10b981", disabled: mediaLocked, onPress: handlePickImageVideo },
    ...(!isInstagram
      ? [{ label: "Documents", icon: "insert-drive-file", color: "#dc2626", disabled: mediaLocked, onPress: () => pickFile("document") }]
      : []),
    { label: "Audio", icon: "audiotrack", color: "#eab308", disabled: mediaLocked, onPress: () => pickFile("audio") },
    ...(isWhatsApp && !isGroup
      ? [
          { label: directSend ? "Direct Send: on" : "Direct Send (Utility)", icon: "bolt", color: "#f59e0b", disabled: false, onPress: () => { setSheetVisible(false); onToggleDirectSend?.(!directSend); } },
          { label: "Send Location", icon: "place", color: "#22c55e", disabled: mediaLocked, onPress: () => { setSheetVisible(false); onOpenSpecial?.("location"); } },
          { label: "Request Location", icon: "my-location", color: "#a855f7", disabled: mediaLocked, onPress: () => { setSheetVisible(false); onOpenSpecial?.("requestLocation"); } },
          { label: "Request Address", icon: "home", color: "#ec4899", disabled: mediaLocked, onPress: () => { setSheetVisible(false); onOpenSpecial?.("requestAddress"); } },
        ]
      : []),
  ];

  if (groupNotice) {
    return (
      <View
        style={{ backgroundColor: isDark ? "#0b121c" : "#ffffff", borderTopColor: colors.divider, borderTopWidth: 1, paddingBottom: Math.max(insets.bottom, 12) }}
        className="px-4 pt-4 items-center shrink-0 z-20"
      >
        <Text style={{ color: colors.onSurfaceVariant, fontSize: 14, textAlign: "center" }}>{groupNotice}</Text>
      </View>
    );
  }

  const rowBottomPadding = keyboardHeight > 0 ? 20 : (sheetVisible ? 8 : Math.max(insets.bottom, 8));

  return (
    <View
      style={{ backgroundColor: "transparent" }}
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

      {/* WhatsApp 24-hour window closed */}
      {windowClosed && !directSend && (
        <View
          style={{ backgroundColor: isDark ? "rgba(120, 53, 15, 0.35)" : "#fffbeb", borderColor: isDark ? "#92400e" : "#fcd34d", borderWidth: 1 }}
          className="mx-3 mt-2 p-3 rounded-xl"
        >
          <Text style={{ color: isDark ? "#fcd34d" : "#92400e", fontSize: 13, fontWeight: "600" }}>
            24-hour customer window closed. Send a pre-approved template or enable Direct Send.
          </Text>
          {lastCustomerAt ? (
            <Text style={{ color: isDark ? "#fcd34d" : "#92400e", fontSize: 12, marginTop: 2, opacity: 0.85 }}>
              Last message from the customer: {formatAgo(lastCustomerAt)}.
            </Text>
          ) : null}
          <View className="flex-row gap-2 mt-2">
            <Pressable onPress={onPressTemplates} style={{ backgroundColor: colors.primary }} className="px-3 py-1.5 rounded-lg active:opacity-80">
              <Text style={{ color: colors.onPrimary, fontSize: 13, fontWeight: "700" }}>Choose Template</Text>
            </Pressable>
            <Pressable
              onPress={() => onToggleDirectSend?.(true)}
              style={{ borderColor: colors.primary, borderWidth: 1 }}
              className="px-3 py-1.5 rounded-lg active:opacity-80"
            >
              <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "700" }}>Use Direct Send</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Direct Send is on */}
      {isWhatsApp && directSend && (
        <View
          style={{ backgroundColor: isDark ? "rgba(30, 41, 59, 0.95)" : "#f1f5f9", borderColor: colors.divider, borderWidth: 1 }}
          className="mx-3 mt-2 px-3 py-2 rounded-xl flex-row items-center justify-between"
        >
          <Text style={{ color: colors.onSurface, fontSize: 13, fontWeight: "600", flex: 1 }}>
            ⚡ Direct Send (Utility) active. Messages are sent as utility messages.
          </Text>
          <Pressable onPress={() => onToggleDirectSend?.(false)} hitSlop={8}>
            <Icon name="close" size={18} color={colors.outline} />
          </Pressable>
        </View>
      )}

      {/* Reply Preview Banner */}
      {replyingTo && (
        <View
          style={{
            backgroundColor: isDark ? "rgba(30, 41, 59, 0.95)" : "rgba(241, 245, 249, 0.98)",
            borderLeftColor: colors.primary,
            borderLeftWidth: 4,
            borderColor: colors.divider,
            borderWidth: 1,
            borderTopWidth: 0,
          }}
          className="mx-3 mt-2 mb-1 p-2.5 rounded-r-xl flex-row items-center justify-between shadow-xs"
        >
          <View className="flex-1 mr-2">
            <View className="flex-row items-center gap-1.5 mb-0.5">
              <Icon name="reply" size={13} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>
                {replyingTo.senderName || (replyingTo.isOutgoing ? "You" : "Contact")}
              </Text>
            </View>
            <Text
              numberOfLines={1}
              style={{ color: colors.onSurfaceVariant, fontSize: 13 }}
            >
              {replyingTo.text || (replyingTo.type && replyingTo.type !== 'text' ? `[${replyingTo.type}]` : "Message")}
            </Text>
          </View>

          <Pressable
            onPress={onCancelReply}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            className="w-7 h-7 rounded-full items-center justify-center active:opacity-70 bg-black/10 dark:bg-white/10"
          >
            <Icon name="close" size={16} color={colors.outline} />
          </Pressable>
        </View>
      )}

      {/* Voice recorder replaces the message box while recording */}
      {recording ? (
        <VoiceRecorderBar
          bottomPadding={rowBottomPadding}
          onCancel={() => setRecording(false)}
          onDone={({ uri }) => {
            setRecording(false);
            onSendMedia(
              { kind: "audio", uri, name: `voice-${Date.now()}.m4a`, mimeType: "audio/mp4", size: null, isVoice: true },
              "",
              replyingTo
            );
          }}
        />
      ) : (
        <View className="flex-row items-end z-10" style={{ paddingHorizontal: 6, paddingTop: 6, gap: 6, paddingBottom: rowBottomPadding }}>
          <View
            style={{
              backgroundColor: colors.chatComposer,
              borderRadius: 25,
              minHeight: 50,
              paddingHorizontal: 4,
            }}
            className="flex-1 flex-row items-end"
          >
            <Pressable onPress={handleEmojiIconPress} className="rounded-full active:opacity-70" style={{ width: 44, height: 50, alignItems: "center", justifyContent: "center" }}>
              <Icon name={emojiIconName} size={25} color={isDark ? "#8696a0" : "#54656f"} />
            </Pressable>
            <View style={{ flex: 1, justifyContent: "center", minHeight: 50 }}>
            {/* The native placeholder ignores the app font on some Samsung phones, so it is drawn as Text */}
            {text.length === 0 && (
              <Text pointerEvents="none" numberOfLines={1} style={{ position: "absolute", left: 4, right: 0, fontSize: 17, color: isDark ? "#8696a0" : "#667781" }}>
                {composerLocked ? "24-hour window closed" : "Message"}
              </Text>
            )}
            <TextInput
              ref={inputRef}
              style={{
                maxHeight: 120,
                color: colors.onSurface,
                fontSize: 17,
                fontFamily: "PlusJakartaSans_400Regular",
                paddingVertical: 12,
                paddingHorizontal: 4,
              }}
              accessibilityLabel={composerLocked ? "24-hour window closed" : "Message"}
              editable={!composerLocked}
              maxLength={isInstagram ? 1000 : undefined}
              multiline
              value={text}
              onChangeText={setText}
              onFocus={() => setSheetVisible(false)}
            />
            </View>
            <Pressable onPress={handleToggleMediaSheet} className="rounded-full active:opacity-70" style={{ width: 42, height: 50, alignItems: "center", justifyContent: "center" }}>
              <Icon name="attach-file" size={24} color={isDark ? "#8696a0" : "#54656f"} style={{ transform: [{ rotate: "-45deg" }] }} />
            </Pressable>
            {text.trim().length === 0 && (
              <Pressable onPress={handleCamera} className="rounded-full active:opacity-70" style={{ width: 44, height: 50, alignItems: "center", justifyContent: "center", opacity: mediaLocked ? 0.4 : 1 }}>
                <Icon name="photo-camera" size={24} color={isDark ? "#8696a0" : "#54656f"} />
              </Pressable>
            )}
          </View>

          <Pressable
            onPress={text.trim().length > 0 ? handleSend : startVoice}
            accessibilityLabel={text.trim().length > 0 ? "Send" : "Record voice message"}
            style={{
              width: 50,
              height: 50,
              borderRadius: 25,
              backgroundColor: colors.chatAccent,
              opacity: (text.trim().length > 0 ? composerLocked : mediaLocked) ? 0.4 : 1,
              elevation: 2,
            }}
            className="items-center justify-center active:opacity-80"
          >
            <Icon
              name={text.trim().length > 0 ? "send" : "mic"}
              size={24}
              color={colors.onChatAccent}
            />
          </Pressable>
        </View>
      )}

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
                onPress={opt.disabled && opt.label !== "Direct Send (Utility)" ? lockedPress : opt.onPress}
                style={{ opacity: opt.disabled ? 0.4 : 1 }}
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

      <MediaPreviewModal
        items={preview}
        initialCaption={text.trim()}
        onClose={() => setPreview(null)}
        onSend={confirmPreview}
      />
    </View>
  );
});
