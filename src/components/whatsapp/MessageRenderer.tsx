import React, { useState, useEffect, useRef, useMemo } from "react";
import { View, Pressable, Modal, Linking, Alert, ActivityIndicator, ScrollView, StatusBar, ToastAndroid, Platform } from "react-native";
import { Text } from "../ui/Text";
import { Icon } from "../ui/Icon";
import { Image } from "expo-image";
import { NormalizedChatMessage, formatMessageTime, formatFileSize, getMediaPayload, getTemplatePayload, getInteractivePayload, getContactsPayload, getLocationPayload, asArray, parseMaybeJson } from "../../lib/messageUtils";
import { cn } from "../../lib/utils";
import API from "../../config/axios";
import { useSyncStore } from "../../store/syncStore";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { globalMediaQueue } from "../../lib/mediaQueue";
import { expoDb } from "../../db/client";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useVideoPlayer, VideoView } from "expo-video";

import { useMessageMedia } from "../../hooks/useMessageMedia";
import { useThemeStore } from "../../store/themeStore";

const Bubble = React.memo(({ message, children, wide = false }: { message: NormalizedChatMessage; children: React.ReactNode; wide?: boolean }) => {
  const isMe = message.isOutgoing;
  const isDark = useThemeStore((state) => state.isDark);
  const colors = useThemeStore((state) => state.colors);
  const formattedTime = message.createdAt ? formatMessageTime(message.createdAt) : "";

  const getStatusIconName = () => {
    const raw = (message as any).status;
    if (raw === 4 || raw === "4") return "error-outline";
    if (raw === 3 || raw === "3") return "done-all";
    if (raw === 2 || raw === "2") return "done-all";
    if (raw === 1 || raw === "1") return "check";
    const s = String(raw || "").toLowerCase();
    if (s === "read" || s === "delivered") return "done-all";
    if (s === "sent") return "check";
    if (s === "failed" || s === "error") return "error-outline";
    if (s === "pending" || s === "sending") return "access-time";
    return "check";
  };

  const getStatusIconColor = () => {
    const raw = (message as any).status;
    if (raw === 3 || raw === "3" || String(raw).toLowerCase() === "read") return isDark ? "#53bdeb" : "#00326b";
    if (raw === 4 || raw === "4" || String(raw).toLowerCase() === "failed") return "#e53935";
    return isMe ? (isDark ? "rgba(255,255,255,0.7)" : "#737782") : colors.outline;
  };

  return (
    <View className={cn("flex-row px-4 py-1", isMe ? "justify-end" : "justify-start")}>
      <View 
        style={{
          backgroundColor: isMe
            ? (isDark ? "#005c4b" : "#d9fdd3")
            : (isDark ? "#121d2b" : "#ffffff"),
          borderColor: isMe
            ? (isDark ? "rgba(0, 92, 75, 0.6)" : "rgba(193, 232, 186, 0.6)")
            : (isDark ? colors.divider : "rgba(0, 50, 107, 0.08)"),
          borderWidth: 1,
        }}
        className={cn(
          "rounded-2xl px-3 py-2 shadow-xs relative", 
          wide ? "max-w-[87%]" : "max-w-[80%]", 
          isMe ? "rounded-tr-sm" : "rounded-tl-sm"
        )}
      >
        {children}
        <View className="flex-row justify-end items-center gap-1 mt-1">
          {isMe && message.senderName && (
            <Text 
              style={{ color: isDark ? "rgba(255,255,255,0.7)" : "#5f6368", fontSize: 10.5 }} 
              className="max-w-[100px]" 
              numberOfLines={1}
            >
              {message.senderName} • 
            </Text>
          )}
          <Text 
            style={{ color: isMe ? (isDark ? "rgba(255,255,255,0.7)" : "#5f6368") : colors.outline, fontSize: 10.5 }}
          >
            {formattedTime}
          </Text>
          {isMe && <Icon name={getStatusIconName()} size={13} color={getStatusIconColor()} />}
        </View>
      </View>
    </View>
  );
});

const URL_RX = /^(https?:\/\/[^\s]+|www\.[^\s]+)$/i;
const PHONE_RX = /^\+?[0-9][0-9\s().\-]{6,}[0-9]$/;

const RichText = React.memo(({ text, muted, isOutgoing }: { text: unknown; muted?: boolean; isOutgoing?: boolean }) => {
  const isDark = useThemeStore((state) => state.isDark);
  const colors = useThemeStore((state) => state.colors);
  const normalized = String(text ?? "").replace(/\\n/g, "\n");
  if (!normalized) return null;

  const defaultColor = isOutgoing
    ? (isDark ? "#ffffff" : "#0b1c30")
    : colors.onSurface;

  const mutedColor = isOutgoing
    ? (isDark ? "rgba(255,255,255,0.75)" : "#5f6368")
    : colors.outline;

  const linkColor = isOutgoing
    ? (isDark ? "#7dd3fc" : "#00326b")
    : colors.primary;

  const parts = normalized.split(/(\n|\s+)/g);
  const nodes = parts.map((part, i) => {
    if (!part) return null;
    if (/^\s+$/.test(part)) return part;
    if (part === "\n") return "\n";
    const m = part.match(/^(.+?)([.,!?;:)]*)$/);
    const core = m?.[1] || part; 
    const suf = m?.[2] || "";
    const bold = core.length > 2 && core.startsWith("*") && core.endsWith("*");
    const val = bold ? core.slice(1, -1) : core;
    const isUrl = URL_RX.test(val);
    const digits = val.replace(/\D/g, "");
    const isPhone = !isUrl && digits.length >= 8 && digits.length <= 15 && PHONE_RX.test(val);

    if (isUrl) { 
      const href = val.startsWith("http") ? val : "https://" + val; 
      return (
        <Text key={i} style={{ color: linkColor, textDecorationLine: "underline" }} onPress={() => Linking.openURL(href).catch(() => {})}>
          {bold ? <Text style={{ fontWeight: "700", color: linkColor }}>{val}</Text> : val}{suf}
        </Text>
      ); 
    }
    if (isPhone) {
      return (
        <Text key={i} style={{ color: linkColor, textDecorationLine: "underline" }} onPress={() => Linking.openURL(`tel:${digits}`).catch(() => {})}>
          {val}{suf}
        </Text>
      );
    }
    return <Text key={i} style={bold ? { fontWeight: "700", color: defaultColor } : { color: defaultColor }}>{val}{suf}</Text>;
  });

  return (
    <Text 
      style={{ 
        color: muted ? mutedColor : defaultColor, 
        fontSize: muted ? 12.5 : 14.5,
        lineHeight: muted ? 18 : 21,
      }} 
      selectable
    >
      {nodes}
    </Text>
  );
});

const ReplyPreview = React.memo(({ message }: { message: NormalizedChatMessage }) => {
  const isDark = useThemeStore((state) => state.isDark);
  const colors = useThemeStore((state) => state.colors);
  const replyTo = (message as any).reply_to;
  if (!replyTo) return null;
  const sender = replyTo.sender || replyTo.senderName || "";
  const type = replyTo.message_type || replyTo.type || "";
  const content = replyTo.content ||
    (type === "image" ? "📷 Image" : type === "video" ? "🎥 Video" : type === "audio" ? "🎤 Audio" : type === "document" ? "📄 Document" : type === "location" ? "📍 Location" : type === "template" ? "📋 Template" : "");
  if (!sender && !content) return null;

  return (
    <View 
      style={{
        backgroundColor: isDark ? "rgba(0, 0, 0, 0.3)" : "rgba(0, 50, 107, 0.05)",
        borderLeftColor: colors.primary,
        borderLeftWidth: 3,
      }}
      className="mb-1.5 rounded-lg overflow-hidden px-2 py-1.5"
    >
      {sender ? <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "700" }} numberOfLines={1}>{sender}</Text> : null}
      {content ? <Text style={{ color: colors.outline, fontSize: 11 }} numberOfLines={2}>{content}</Text> : null}
    </View>
  );
});

const ActionChip = React.memo(({ label, href }: { label: string; href?: string }) => {
  const [pressed, setPressed] = useState(false);
  const isDark = useThemeStore((state) => state.isDark);
  const colors = useThemeStore((state) => state.colors);

  return (
    <Pressable 
      onPress={() => href && Linking.openURL(href).catch(() => {})} 
      onPressIn={() => setPressed(true)} 
      onPressOut={() => { setTimeout(() => setPressed(false), 150); }}
      style={{ 
        marginTop: 8, 
        paddingVertical: 8, 
        borderRadius: 12, 
        backgroundColor: pressed 
          ? (isDark ? "rgba(255,255,255,0.2)" : "rgba(0,50,107,0.1)") 
          : (isDark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.9)"), 
        borderWidth: 1, 
        borderColor: colors.divider, 
        alignItems: "center", 
        flexDirection: "row", 
        justifyContent: "center", 
        gap: 4 
      }}
    >
      {href && <Icon name="open-in-new" size={13} color={colors.primary} />}
      <Text style={{ fontSize: 12.5, fontWeight: "700", color: colors.primary }}>{label}</Text>
    </Pressable>
  );
});

const TextMessage = React.memo(({ message }: { message: NormalizedChatMessage }) => (
  <Bubble message={message}>
    <ReplyPreview message={message} />
    <RichText text={message.content || "[text message]"} isOutgoing={message.isOutgoing} />
  </Bubble>
));

const showToast = (msg: string) => {
  if (Platform.OS === "android") {
    ToastAndroid.show(msg, ToastAndroid.SHORT);
  } else {
    Alert.alert("", msg);
  }
};

const VideoPlayerModalContent = ({ videoUrl }: { videoUrl: string }) => {
  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = true;
    p.play();
  });

  return (
    <VideoView
      player={player}
      style={{ width: "100%", height: "100%" }}
      nativeControls={true}
      fullscreenOptions={{ enable: false }}
      allowsPictureInPicture={true}
      contentFit="contain"
    />
  );
};

interface FullscreenMediaModalProps {
  visible: boolean;
  onClose: () => void;
  mediaUrl: string;
  type: "image" | "video";
  message: NormalizedChatMessage;
}

const FullscreenMediaModal = ({ visible, onClose, mediaUrl, type, message }: FullscreenMediaModalProps) => {
  const insets = useSafeAreaInsets();
  const [showBars, setShowBars] = useState(true);
  const [isStarred, setIsStarred] = useState(false);

  const formattedDate = useMemo(() => {
    const value = message.createdAt;
    const date = value ? new Date(value as any) : new Date();
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString([], {
      month: "short",
      day: "numeric",
    }) + ", " + date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }).toLowerCase();
  }, [message.createdAt]);

  const handleStarPress = () => {
    const nextStarred = !isStarred;
    setIsStarred(nextStarred);
    showToast(nextStarred ? "Message starred" : "Message unstarred");
  };

  const handleForwardPress = () => {
    showToast("Forward message selected");
  };

  const handleReplyPress = () => {
    showToast("Replying to message");
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <View className="flex-1 bg-black relative justify-center items-center">
        {/* Main Content Area */}
        <Pressable
          onPress={() => setShowBars((prev) => !prev)}
          className="w-full h-full justify-center items-center"
        >
          {type === "video" ? (
            <VideoPlayerModalContent videoUrl={mediaUrl} />
          ) : (
            <Image
              source={{ uri: mediaUrl }}
              style={{ width: "100%", height: "100%" }}
              contentFit="contain"
            />
          )}
        </Pressable>

        {/* Top Header Bar */}
        {showBars && (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              paddingTop: Math.max(insets.top, 12),
              paddingBottom: 12,
              backgroundColor: "rgba(0,0,0,0.6)",
              flexDirection: "row",
              alignItems: "center",
              zIndex: 50
            }}
          >
            <Pressable onPress={onClose} className="p-3 active:opacity-60">
              <Icon name="arrow-back" size={24} color="#fff" />
            </Pressable>

            <View className="flex-1 ml-1 justify-center">
              <Text className="font-semibold text-base" style={{ color: "#ffffff" }}>
                {message.isOutgoing ? "You" : (message.senderName || "Souken Labs")}
              </Text>
              <Text className="text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>
                {formattedDate}
              </Text>
            </View>

            {/* Action Buttons: Star/Pin, Forward */}
            <Pressable onPress={handleStarPress} className="p-3 active:opacity-60">
              <Icon name={isStarred ? "star" : "star-border"} size={24} color={isStarred ? "#fbbf24" : "#fff"} />
            </Pressable>

            <Pressable onPress={handleForwardPress} className="p-3 active:opacity-60">
              <Icon name="reply" size={24} color="#fff" style={{ transform: [{ scaleX: -1 }] }} />
            </Pressable>
          </View>
        )}

        {/* Bottom Footer Bar */}
        {showBars && (
          <View
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              paddingBottom: Math.max(insets.bottom, 12),
              paddingTop: 12,
              backgroundColor: "rgba(0,0,0,0.6)",
              zIndex: 50
            }}
          >
            {/* Caption Text (if any) */}
            {message.content ? (
              <Text className="text-sm px-4 pb-3" style={{ color: "#ffffff" }}>
                {message.content}
              </Text>
            ) : null}

            {/* Action Buttons Row */}
            <View className="flex-row justify-end items-center px-4">
              <Pressable onPress={handleReplyPress} className="p-2 bg-white/10 rounded-full active:opacity-60">
                <Icon name="reply" size={24} color="#fff" />
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
};

const ImageMessage = React.memo(({ message }: { message: NormalizedChatMessage }) => {
  const isDark = useThemeStore((state) => state.isDark);
  const colors = useThemeStore((state) => state.colors);

  const [retryTrigger, setRetryTrigger] = useState(0);
  const media = useMessageMedia({
    mediaId: message.mediaId,
    messageType: message.type,
    chatId: message.chatId,
    directUrl: message.mediaUrl,
    shouldLoad: true,
    phoneNumberId: message.accountId,
    retryTrigger,
  });

  const [modal, setModal] = useState(false);
  const [failed, setFailed] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<number>(1);

  useEffect(() => {
    setFailed(false);
    setAspectRatio(1);
  }, [media.url]);

  return (
    <>
      <Bubble message={message} wide>
        {media.loading ? (
          <View 
            style={{ 
              backgroundColor: isDark ? "rgba(0,0,0,0.3)" : colors.surfaceContainerLowest,
              borderColor: colors.divider,
              borderWidth: 1,
            }} 
            className="w-[250px] h-[250px] rounded-xl items-center justify-center gap-2"
          >
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={{ color: colors.outline, fontSize: 11 }}>Loading image...</Text>
          </View>
        ) : media.url && !failed ? (
          <Pressable onPress={() => setModal(true)} className="active:opacity-90">
            <Image
              source={{ uri: media.url }}
              style={{ width: 250, aspectRatio, borderRadius: 12, maxHeight: 650 }}
              contentFit="contain"
              onLoad={(evt) => {
                if (evt.source && evt.source.width && evt.source.height) {
                  setAspectRatio(evt.source.width / evt.source.height);
                }
              }}
              onError={(err) => { console.warn("Image load err:", err.error || err); setFailed(true); }}
            />
          </Pressable>
        ) : (
          <Pressable 
            onPress={() => setRetryTrigger(prev => prev + 1)} 
            style={{ 
              backgroundColor: isDark ? "rgba(0,0,0,0.3)" : colors.surfaceContainerLow,
              borderColor: colors.divider,
              borderWidth: 1,
            }} 
            className="w-[250px] h-[250px] rounded-xl items-center justify-center active:opacity-90"
          >
            <Icon name="refresh" size={32} color={colors.primary} />
            <Text style={{ color: colors.outline, fontSize: 11, fontWeight: "600" }} className="mt-2">Failed to load. Tap to retry</Text>
          </Pressable>
        )}
        {message.content ? <RichText text={message.content} isOutgoing={message.isOutgoing} /> : null}
      </Bubble>
      {media.url && (
        <FullscreenMediaModal
          visible={modal}
          onClose={() => setModal(false)}
          mediaUrl={media.url}
          type="image"
          message={message}
        />
      )}
    </>
  );
});

const VideoMessage = React.memo(({ message }: { message: NormalizedChatMessage }) => {
  const isDark = useThemeStore((state) => state.isDark);
  const colors = useThemeStore((state) => state.colors);

  const [retryTrigger, setRetryTrigger] = useState(0);
  const media = useMessageMedia({
    mediaId: message.mediaId,
    messageType: message.type,
    chatId: message.chatId,
    directUrl: message.mediaUrl,
    shouldLoad: true,
    phoneNumberId: message.accountId,
    retryTrigger,
  });
  const [modal, setModal] = useState(false);

  const handlePress = () => {
    if (media.url) setModal(true);
    else if (message.mediaUrl) Linking.openURL(message.mediaUrl).catch(() => Alert.alert("Error", "Could not open video."));
  };

  return (
    <>
      <Bubble message={message} wide>
        {media.loading ? (
          <View 
            style={{ 
              backgroundColor: isDark ? "rgba(0,0,0,0.3)" : colors.surfaceContainerLowest,
              borderColor: colors.divider,
              borderWidth: 1,
            }} 
            className="w-[250px] h-[250px] rounded-xl items-center justify-center gap-2"
          >
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={{ color: colors.outline, fontSize: 11 }}>Loading video...</Text>
          </View>
        ) : media.url ? (
          <Pressable onPress={handlePress} className="active:opacity-90">
            <View className="w-[250px] h-[250px] rounded-xl bg-black overflow-hidden justify-center items-center">
              <Image
                source={{ uri: media.url }}
                style={{ position: "absolute", width: "100%", height: "100%" }}
                contentFit="contain"
                onError={() => {}}
              />
              <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.25)", alignItems: "center", justifyContent: "center" }}>
                <View className="w-12 h-12 rounded-full bg-black/60 items-center justify-center"><Icon name="play-arrow" size={28} color="#fff" /></View>
              </View>
            </View>
          </Pressable>
        ) : (
          <Pressable 
            onPress={() => setRetryTrigger(prev => prev + 1)} 
            style={{ 
              backgroundColor: isDark ? "rgba(0,0,0,0.3)" : colors.surfaceContainerLow,
              borderColor: colors.divider,
              borderWidth: 1,
            }} 
            className="w-[250px] h-[250px] rounded-xl items-center justify-center active:opacity-90"
          >
            <Icon name="refresh" size={32} color={colors.primary} />
            <Text style={{ color: colors.outline, fontSize: 11, fontWeight: "600" }} className="mt-2">Failed to load. Tap to retry</Text>
          </Pressable>
        )}
        {message.content ? <RichText text={message.content} isOutgoing={message.isOutgoing} /> : null}
      </Bubble>
      {media.url && (
        <FullscreenMediaModal
          visible={modal}
          onClose={() => setModal(false)}
          mediaUrl={media.url}
          type="video"
          message={message}
        />
      )}
    </>
  );
});

const NativeAudioMessage = React.memo(({ message }: { message: NormalizedChatMessage }) => {
  const isDark = useThemeStore((state) => state.isDark);
  const colors = useThemeStore((state) => state.colors);

  const media = useMessageMedia({
    mediaId: message.mediaId,
    messageType: message.type,
    chatId: message.chatId,
    directUrl: message.mediaUrl,
    phoneNumberId: message.accountId,
  });
  const player = useAudioPlayer(media.url ? { uri: media.url } : null);
  const status = useAudioPlayerStatus(player);
  const fmt = (s: number) => { const t = Math.floor(s); return `${Math.floor(t / 60)}:${t % 60 < 10 ? "0" : ""}${t % 60}`; };
  const dur = status.duration || 0; 
  const cur = status.currentTime || 0; 
  const pct = dur > 0 ? (cur / dur) * 100 : 0;

  return (
    <Bubble message={message} wide>
      <View 
        style={{
          backgroundColor: isDark ? "rgba(0, 0, 0, 0.25)" : "rgba(255, 255, 255, 0.7)",
          borderColor: colors.divider,
          borderWidth: 1,
        }}
        className="flex-row items-center gap-3 rounded-xl p-3 min-w-[240px]"
      >
        <Pressable 
          onPress={() => { if (media.loading) return; if (!media.url) { Alert.alert("Unavailable", "Audio not accessible."); return; } if (status.playing) player.pause(); else player.play(); }} 
          disabled={media.loading || !media.url} 
          style={{ backgroundColor: colors.primary }}
          className="w-10 h-10 rounded-full items-center justify-center active:opacity-80"
        >
          {media.loading || status.isBuffering ? (
            <ActivityIndicator size="small" color={colors.onPrimary} />
          ) : (
            <Icon name={status.playing ? "pause" : "play-arrow"} size={22} color={colors.onPrimary} />
          )}
        </Pressable>
        <View className="flex-1">
          <View 
            style={{ backgroundColor: isDark ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.1)" }}
            className="h-1 rounded-full overflow-hidden"
          >
            <View 
              style={{ width: `${pct}%`, backgroundColor: colors.primary }} 
              className="h-full" 
            />
          </View>
          <View className="flex-row justify-between mt-1">
            <Text style={{ fontSize: 10, color: colors.outline }}>{fmt(cur)}</Text>
            <Text style={{ fontSize: 10, color: colors.outline }}>{dur > 0 ? fmt(dur) : "--:--"}</Text>
          </View>
          {media.error && <Text className="text-[10px] text-red-500 font-semibold mt-1">Audio expired or unavailable</Text>}
        </View>
        <View 
          style={{ backgroundColor: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)" }}
          className="w-8 h-8 rounded-full items-center justify-center"
        >
          <Icon name="mic" size={16} color={colors.outline} />
        </View>
      </View>
    </Bubble>
  );
});

const AudioMessage = NativeAudioMessage;

const DocumentMessage = React.memo(({ message }: { message: NormalizedChatMessage }) => {
  const isDark = useThemeStore((state) => state.isDark);
  const colors = useThemeStore((state) => state.colors);

  const media = useMessageMedia({
    mediaId: message.mediaId,
    messageType: message.type,
    chatId: message.chatId,
    directUrl: message.mediaUrl,
    phoneNumberId: message.accountId,
  });
  const [downloading, setDownloading] = useState(false);
  const fileName = message.mediaFileName || message.content || "Document";
  const ext = fileName.includes(".") ? fileName.split(".").pop()?.toUpperCase() : message.mediaMimeType || "DOC";

  const handleDownload = async () => {
    if (downloading) return;
    const url = media.url || message.mediaUrl || "";
    if (!url) { Alert.alert("Unavailable", "Document URL not available."); return; }
    setDownloading(true);
    try { await Linking.openURL(url); } catch { Alert.alert("Error", "Could not open document."); } finally { setDownloading(false); }
  };

  return (
    <Bubble message={message} wide>
      <Pressable 
        onPress={handleDownload} 
        disabled={downloading || media.loading} 
        style={{
          backgroundColor: isDark ? "rgba(0, 0, 0, 0.25)" : "rgba(255, 255, 255, 0.7)",
          borderColor: colors.divider,
          borderWidth: 1,
        }}
        className="flex-row items-center gap-3 rounded-xl p-3 active:opacity-80 min-w-[240px]"
      >
        <View 
          style={{ backgroundColor: isDark ? "rgba(239, 68, 68, 0.2)" : "#fee2e2" }}
          className="w-10 h-10 rounded-lg items-center justify-center"
        >
          <Icon name="description" size={22} color="#ef4444" />
        </View>
        <View className="flex-1">
          <Text numberOfLines={1} style={{ color: colors.onSurface, fontSize: 14, fontWeight: "600" }}>{fileName}</Text>
          <Text style={{ color: colors.outline, fontSize: 10, marginTop: 2 }} className="uppercase">
            {[formatFileSize(message.mediaFileSize), ext].filter(Boolean).join(" - ") || "document"}
          </Text>
          {media.error && <Text className="text-[10px] text-red-500 font-semibold mt-1">Media expired or unavailable</Text>}
        </View>
        <View 
          style={{ borderColor: colors.divider, borderWidth: 1 }}
          className="w-8 h-8 rounded-full items-center justify-center"
        >
          {downloading || media.loading ? (
            <ActivityIndicator size="small" color={colors.outline} />
          ) : (
            <Icon name="download" size={18} color={colors.outline} />
          )}
        </View>
      </Pressable>
      {message.content && message.content !== fileName ? <RichText text={message.content} muted isOutgoing={message.isOutgoing} /> : null}
    </Bubble>
  );
});

const getTemplateHeaderMedia = (header: any) => {
  const param = asArray<any>(header?.parameters)[0] || header;
  const type = String(param?.type || header?.format || header?.type || "").toUpperCase();
  const image = param?.image || header?.image; const video = param?.video || header?.video;
  const doc = param?.document || header?.document; const loc = param?.location || header?.location;
  if (image) return { type: "IMAGE", url: image.link || image.url, id: image.id || image.uploaded_id };
  if (video) return { type: "VIDEO", url: video.link || video.url, id: video.id || video.uploaded_id };
  if (doc) return { type: "DOCUMENT", url: doc.link || doc.url, id: doc.id || doc.uploaded_id, filename: doc.filename };
  if (loc) return { type: "LOCATION", ...loc };
  return { type, text: header?.text || param?.text || "" };
};

const TemplateHeader = React.memo(({ message, header }: { message: NormalizedChatMessage; header: any }) => {
  const isDark = useThemeStore((state) => state.isDark);
  const colors = useThemeStore((state) => state.colors);

  const hm = getTemplateHeaderMedia(header);
  const resolved = useMessageMedia({
    mediaId: hm.id || message.mediaId,
    messageType: String(hm.type).toLowerCase() || message.type,
    chatId: message.chatId,
    directUrl: hm.url || message.mediaUrl,
    phoneNumberId: message.accountId,
    shouldLoad: true,
  });
  const [modal, setModal] = useState(false);

  if (hm.type === "IMAGE") {
    if (!resolved.url && resolved.loading) return <View className="w-full h-32 rounded-lg bg-surface-container-lowest items-center justify-center mb-3"><ActivityIndicator size="small" color={colors.primary} /></View>;
    if (resolved.url) return (
      <>
        <Pressable onPress={() => setModal(true)} className="active:opacity-90">
          <Image
            source={{ uri: resolved.url }}
            style={{ width: 250, aspectRatio: 1, borderRadius: 12, maxHeight: 650 }}
            className="mb-3"
            contentFit="cover"
            onError={() => {}}
          />
        </Pressable>
        <FullscreenMediaModal
          visible={modal}
          onClose={() => setModal(false)}
          mediaUrl={resolved.url}
          type="image"
          message={message}
        />
      </>
    );
    return null;
  }
  if (hm.type === "VIDEO") {
    const videoUrl = resolved.url || hm.url || message.mediaUrl;
    return (
      <>
        <Pressable onPress={() => videoUrl && setModal(true)} className="active:opacity-90">
          <View className="w-full h-32 rounded-lg bg-black mb-3 items-center justify-center">
            <Icon name="play-circle-filled" size={40} color="#fff" />
          </View>
        </Pressable>
        {videoUrl && (
          <FullscreenMediaModal
            visible={modal}
            onClose={() => setModal(false)}
            mediaUrl={videoUrl}
            type="video"
            message={message}
          />
        )}
      </>
    );
  }
  if (hm.type === "DOCUMENT") return (
    <View 
      style={{ backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "#ffffff", borderColor: colors.divider, borderWidth: 1 }}
      className="flex-row items-center gap-2 rounded-lg p-2 mb-3"
    >
      <Icon name="description" size={18} color="#ef4444" />
      <Text style={{ color: colors.onSurface, fontSize: 12, fontWeight: "600" }} className="truncate flex-1" numberOfLines={1}>{hm.filename || "Document"}</Text>
    </View>
  );
  if (hm.type === "LOCATION" && (hm as any).latitude && (hm as any).longitude) return (
    <View 
      style={{ backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "#ffffff", borderColor: colors.divider, borderWidth: 1 }}
      className="w-full h-24 rounded-lg mb-3 items-center justify-center gap-1"
    >
      <Icon name="place" size={28} color="#0284c7" />
      <Text style={{ color: colors.outline, fontSize: 12, fontWeight: "600" }}>{(hm as any).latitude}, {(hm as any).longitude}</Text>
    </View>
  );
  if (hm.text) return <Text style={{ color: colors.onSurface, fontSize: 14, fontWeight: "700", marginBottom: 8 }}>{hm.text}</Text>;
  return null;
});

const TemplateMessage = React.memo(({ message }: { message: NormalizedChatMessage }) => {
  const isDark = useThemeStore((state) => state.isDark);
  const colors = useThemeStore((state) => state.colors);

  const template = getTemplatePayload(message);
  const components = asArray<any>(template?.savedContent?.template?.components || template?.components);
  const header = components.find((c: any) => String(c?.type).toLowerCase() === "header");
  const body = components.find((c: any) => String(c?.type).toLowerCase() === "body");
  const footer = components.find((c: any) => String(c?.type).toLowerCase() === "footer");
  const btnComp = components.find((c: any) => ["button", "buttons"].includes(String(c?.type).toLowerCase()));
  const carousel = components.find((c: any) => String(c?.type).toLowerCase() === "carousel");
  const buttons = asArray<any>(btnComp?.buttons?.length ? btnComp.buttons : btnComp ? [btnComp] : []);
  const title = (message as any).templateTitle || (message as any).templateName || template?.name || "Template";
  const bodyText = message.content || body?.text || body?.parameters?.map?.((p: any) => p?.text).filter(Boolean).join(" ") || title;
  const footerText = footer?.text || template?.footer || "";

  return (
    <Bubble message={message} wide>
      <View 
        style={{
          backgroundColor: isDark ? "rgba(0, 0, 0, 0.25)" : "rgba(255, 255, 255, 0.75)",
          borderColor: colors.divider,
          borderWidth: 1,
        }}
        className="rounded-xl p-3 min-w-[250px]"
      >
        {header && <TemplateHeader message={message} header={header} />}
        <Text style={{ color: colors.onSurface, fontSize: 14, fontWeight: "700" }}>{title}</Text>
        {bodyText ? <RichText text={bodyText} muted isOutgoing={message.isOutgoing} /> : null}
        {footerText ? <Text style={{ color: colors.outline, fontSize: 10, marginTop: 8 }}>{footerText}</Text> : null}
        {carousel?.cards?.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3 -mx-1">
            {(carousel.cards as any[]).map((card: any, ci: number) => {
              const cc = asArray<any>(card.components);
              const ch = cc.find((c: any) => String(c?.type).toLowerCase() === "header");
              const cb = cc.find((c: any) => String(c?.type).toLowerCase() === "body");
              const cbtn = asArray<any>(cc.find((c: any) => String(c?.type).toLowerCase() === "buttons")?.buttons);
              return (
                <View 
                  key={ci} 
                  style={{
                    backgroundColor: isDark ? "#121d2b" : "#ffffff",
                    borderColor: colors.divider,
                    borderWidth: 1,
                  }}
                  className="w-52 mr-2 rounded-xl overflow-hidden shadow-xs"
                >
                  {ch && <TemplateHeader message={message} header={ch} />}
                  {cb?.text ? <View className="p-2"><RichText text={cb.text} muted isOutgoing={message.isOutgoing} /></View> : null}
                  {cbtn.map((btn: any, bi: number) => (
                    <View key={bi} className="px-2 pb-1">
                      <ActionChip label={btn?.text || btn?.title || "Action"} href={btn?.url} />
                    </View>
                  ))}
                </View>
              );
            })}
          </ScrollView>
        ) : null}
        {buttons.map((btn: any, idx: number) => <ActionChip key={idx} label={btn?.text || btn?.title || btn?.parameters?.[0]?.text || "Action"} href={btn?.url || btn?.link} />)}
      </View>
    </Bubble>
  );
});

const getReadableIFallback = (value: any): string => {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(getReadableIFallback).filter(Boolean).join("\n");
  if (typeof value !== "object") return "";
  return String(value.body?.text || value.body || value.text || value.title || value.name || value.display_text || value.button_reply?.title || value.list_reply?.title || value.nfm_reply?.body || value.nfm_reply?.name || value.parameters?.display_text || value.parameters?.url || value.url || value.id || "");
};

const getIResponseText = (reply: any): string => {
  const response = reply?.response_json || reply?.response || reply?.data;
  const parsed = parseMaybeJson(response);
  const responseText = parsed && typeof parsed === "object" ? Object.entries(parsed as Record<string, any>).map(([k, v]) => k + ": " + (getReadableIFallback(v) || String(v))).join("\n") : getReadableIFallback(parsed);
  return getReadableIFallback(reply) || responseText;
};

const InteractiveMessage = React.memo(({ message }: { message: NormalizedChatMessage }) => {
  const isDark = useThemeStore((state) => state.isDark);
  const colors = useThemeStore((state) => state.colors);

  const interactive = getInteractivePayload(message);
  const type = String(interactive?.type || (message as any).interactive_type || (message as any).message?.interactive?.type || "").toLowerCase();
  const reply = interactive?.button_reply || interactive?.list_reply || interactive?.nfm_reply || (message as any).message?.interactive?.button_reply || (message as any).message?.interactive?.list_reply || (message as any).message?.interactive?.nfm_reply;
  if (reply && (type === "button_reply" || type === "list_reply" || type === "nfm_reply")) {
    return <Bubble message={message}><RichText text={getIResponseText(reply) || "Interactive response"} isOutgoing={message.isOutgoing} /></Bubble>;
  }
  const headerObj = interactive?.header || (message as any).message?.interactive?.header || null;
  const body = String(message.content || interactive?.body?.text || interactive?.body || interactive?.text || interactive?.nfm_reply?.body || interactive?.nfm_reply?.name || "");
  const headerText = typeof headerObj === "string" ? headerObj : headerObj?.text || "";
  const footer = String(interactive?.footer?.text || interactive?.footer || "");
  const action = interactive?.action || {};
  const buttons = asArray<any>(action?.buttons || interactive?.buttons || action?.button);
  const rows = asArray<any>(action?.sections).flatMap((s: any) => asArray<any>(s?.rows));
  const ctaLabel = action?.parameters?.display_text || action?.button?.text || action?.name;
  const ctaUrl = action?.parameters?.url || action?.url;
  const isAddrReq = type === "address_message" || type === "location_request_message" || type === "nfm_reply";
  const fallback = body || getReadableIFallback(interactive) || getReadableIFallback((message as any).message?.interactive) || ("Interactive message" + (type ? ": " + type : ""));
  const [modal, setModal] = useState(false);
  const headerImageUrl = headerObj?.image?.url || headerObj?.image?.link || headerObj?.image;

  return (
    <Bubble message={message} wide>
      <View 
        style={{
          backgroundColor: isDark ? "rgba(0, 0, 0, 0.25)" : "rgba(255, 255, 255, 0.75)",
          borderColor: colors.divider,
          borderWidth: 1,
        }}
        className="rounded-xl p-3 min-w-[250px]"
      >
        {headerImageUrl && (
          <>
            <Pressable onPress={() => setModal(true)} className="active:opacity-90">
              <Image
                source={{ uri: headerImageUrl }}
                className="w-full h-32 rounded-lg mb-3"
                contentFit="cover"
                onError={() => {}}
              />
            </Pressable>
            <FullscreenMediaModal
              visible={modal}
              onClose={() => setModal(false)}
              mediaUrl={headerImageUrl}
              type="image"
              message={message}
            />
          </>
        )}
        {headerText ? <Text style={{ color: colors.onSurface, fontSize: 14, fontWeight: "700", marginBottom: 4 }}>{headerText}</Text> : null}
        <RichText text={fallback} isOutgoing={message.isOutgoing} />
        {footer ? <Text style={{ color: colors.outline, fontSize: 10, marginTop: 8 }}>{footer}</Text> : null}
        {isAddrReq && message.isOutgoing && (
          <View className="mt-2 bg-[#25D366] rounded-lg py-2 flex-row items-center justify-center gap-2">
            <Icon name="place" size={16} color="#fff" />
            <Text className="text-xs font-bold text-white">Provide Address</Text>
          </View>
        )}
        {isAddrReq && !message.isOutgoing && <ActionChip label="Address received" />}
        {ctaLabel && <ActionChip label={String(ctaLabel)} href={ctaUrl} />}
        {buttons.map((btn: any, idx: number) => <ActionChip key={idx} label={btn?.reply?.title || btn?.title || btn?.text || "Option"} />)}
        {rows.slice(0, 8).map((row: any, idx: number) => (
          <View 
            key={idx} 
            style={{
              backgroundColor: isDark ? "#121d2b" : "#ffffff",
              borderColor: colors.divider,
              borderWidth: 1,
            }}
            className="mt-2 p-2 rounded-lg flex-row gap-2 items-start"
          >
            <Icon name="list" size={14} color={colors.primary} />
            <View className="flex-1">
              <Text style={{ color: colors.onSurface, fontSize: 12, fontWeight: "600" }} numberOfLines={1}>{row?.title || row?.id || "List option"}</Text>
              {row?.description ? <Text style={{ color: colors.outline, fontSize: 10, marginTop: 2 }} numberOfLines={2}>{row.description}</Text> : null}
            </View>
          </View>
        ))}
      </View>
    </Bubble>
  );
});

const ButtonMessage = React.memo(({ message }: { message: NormalizedChatMessage }) => {
  const colors = useThemeStore((state) => state.colors);
  const raw = (message as any).message?.button || (message as any).button || {};
  const text = message.content || raw?.text || raw?.payload || "Button response";

  return (
    <Bubble message={message}>
      <ReplyPreview message={message} />
      <View className="flex-row items-center gap-2">
        <Icon name="reply" size={14} color={colors.primary} />
        <RichText text={text} isOutgoing={message.isOutgoing} />
      </View>
    </Bubble>
  );
});

const OrderMessage = React.memo(({ message }: { message: NormalizedChatMessage }) => {
  const colors = useThemeStore((state) => state.colors);
  const isDark = useThemeStore((state) => state.isDark);

  const order = (message as any).order || (message as any).message?.order || getMediaPayload(message);
  const items = asArray<any>(order?.product_items || order?.items);

  return (
    <Bubble message={message} wide>
      <View 
        style={{
          backgroundColor: isDark ? "rgba(0, 0, 0, 0.25)" : "rgba(255, 255, 255, 0.75)",
          borderColor: isDark ? "rgba(16, 185, 129, 0.3)" : "rgba(16, 185, 129, 0.2)",
          borderWidth: 1,
        }}
        className="rounded-xl p-3 min-w-[250px]"
      >
        <View className="flex-row items-center gap-2 mb-2">
          <Icon name="shopping-cart" size={16} color={isDark ? "#34d399" : "#059669"} />
          <Text style={{ color: isDark ? "#34d399" : "#059669", fontWeight: "700", fontSize: 14 }}>Order</Text>
        </View>
        {items.slice(0, 6).map((item: any, idx: number) => (
          <View 
            key={idx} 
            style={{ borderBottomColor: colors.divider, borderBottomWidth: 1 }}
            className="flex-row justify-between py-1"
          >
            <Text style={{ color: colors.onSurface, fontSize: 12 }} className="flex-1 mr-3" numberOfLines={1}>{item?.name || item?.product_retailer_id || "Product"}</Text>
            <Text style={{ color: colors.outline, fontSize: 12, fontWeight: "700" }}>x{item?.quantity || 1}</Text>
          </View>
        ))}
        {items.length === 0 && <RichText text={message.content || "Order details unavailable"} muted isOutgoing={message.isOutgoing} />}
      </View>
    </Bubble>
  );
});

const joinName = (...parts: unknown[]) => parts.map(p => String(p || "").trim()).filter(Boolean).join(" ");
const getContactName = (c: any): string => {
  const n = c?.name || {};
  return String(n?.formatted_name || c?.formatted_name || joinName(n?.prefix, n?.first_name, n?.middle_name, n?.last_name, n?.suffix) || joinName(c?.first_name, c?.middle_name, c?.last_name) || c?.display_name || c?.fullName || c?.name || "Unknown Contact");
};
const getContactInitials = (name: string) => { const p = name.trim().split(/\s+/).filter(Boolean); return (p.length > 1 ? p[0][0] + p[p.length - 1][0] : p[0]?.slice(0, 2) || "CN").toUpperCase(); };
const normCF = (value: unknown, keys: string[], fallback: string): { value: string; label?: string }[] =>
  asArray<any>(value).map((item: any) => {
    if (typeof item === "string" || typeof item === "number") return { value: String(item), label: fallback };
    const fv = keys.map(k => item?.[k]).find((v: any) => v !== undefined && v !== null && String(v).trim());
    return { value: String(fv || "").trim(), label: String(item?.type || item?.label || fallback).trim() };
  }).filter(f => f.value);
const getPhones = (c: any) => normCF(c?.phones || c?.phone_numbers || c?.phoneNumbers || c?.phone || c?.wa_id, ["phone", "wa_id", "number", "value"], "Phone");
const getEmails = (c: any) => normCF(c?.emails || c?.email_addresses || c?.emailAddresses || c?.email, ["email", "address", "value"], "Email");
const getAddresses = (c: any): { value: string; label?: string }[] => asArray<any>(c?.addresses || c?.address).map((a: any) => {
  if (typeof a === "string") return { value: a, label: "Address" };
  const value = joinName(a?.street, a?.city, a?.state, a?.zip, a?.country);
  return { value, label: String(a?.type || "Address") };
}).filter(f => f.value);
const getOrg = (c: any): { value: string; label?: string }[] => {
  const org = c?.org || c?.organization || {};
  const value = joinName(org?.company, org?.department, org?.title) || joinName(c?.company, c?.department, c?.title);
  return value ? [{ value, label: "Organization" }] : [];
};

const ContactsMessage = React.memo(({ message }: { message: NormalizedChatMessage }) => {
  const isDark = useThemeStore((state) => state.isDark);
  const colors = useThemeStore((state) => state.colors);

  const contacts = getContactsPayload(message);
  const loadContacts = useSyncStore(s => s.loadContacts);
  const [savingIdx, setSavingIdx] = useState<number | null>(null);
  const [savedSet, setSavedSet] = useState<Set<number>>(() => new Set());
  const [errIdx, setErrIdx] = useState<number | null>(null);

  const handleSave = async (c: any, idx: number) => {
    const phone = getPhones(c)[0]?.value || "";
    if (!phone || savingIdx !== null) return;
    const clean = phone.replace(/[^0-9]/g, "");
    if (clean.length < 8) { setErrIdx(idx); return; }
    setSavingIdx(idx); setErrIdx(null);
    try {
      const { db } = require("../../db/client");
      const { contacts: ct } = require("../../db/schema");
      await db.insert(ct).values({ id: Math.random().toString(36).substring(7), name: getContactName(c), phone: clean, channel: "whatsapp", status: "Lead", subStatus: "Active", lastActivity: new Date().toISOString() });
      await loadContacts();
      setSavedSet(prev => new Set(prev).add(idx));
    } catch { setErrIdx(idx); } finally { setSavingIdx(null); }
  };

  if (!contacts.length) return (
    <Bubble message={message}>
      <View className="flex-row items-center gap-2 py-1 min-w-[200px]">
        <Icon name="contacts" size={20} color={colors.outline} />
        <Text style={{ color: colors.outline, fontSize: 13.5, fontWeight: "600" }}>Contact details unavailable</Text>
      </View>
    </Bubble>
  );

  return (
    <Bubble message={message} wide>
      <View 
        style={{
          backgroundColor: isDark ? "rgba(0, 0, 0, 0.25)" : "rgba(255, 255, 255, 0.75)",
          borderColor: colors.divider,
          borderWidth: 1,
        }}
        className="rounded-xl overflow-hidden min-w-[260px]"
      >
        {contacts.map((c: any, idx: number) => {
          const name = getContactName(c);
          const phones = getPhones(c); 
          const emails = getEmails(c); 
          const addrs = getAddresses(c); 
          const org = getOrg(c);
          const saved = savedSet.has(idx); 
          const saving = savingIdx === idx;

          return (
            <View 
              key={idx} 
              style={{ borderTopColor: idx > 0 ? colors.divider : "transparent", borderTopWidth: idx > 0 ? 1 : 0 }}
              className="p-3"
            >
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-row items-center gap-3 flex-1 min-w-0">
                  <View 
                    style={{ backgroundColor: isDark ? "rgba(171, 199, 255, 0.16)" : "#eff4ff" }}
                    className="w-10 h-10 rounded-full items-center justify-center"
                  >
                    <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>{getContactInitials(name)}</Text>
                  </View>
                  <View className="flex-1 min-w-0">
                    <Text style={{ color: colors.onSurface, fontSize: 14, fontWeight: "600" }} numberOfLines={1}>{name}</Text>
                    <Text style={{ color: colors.outline, fontSize: 10, marginTop: 2 }}>Contact card</Text>
                  </View>
                </View>
                {phones.length > 0 && (
                  <Pressable 
                    onPress={() => handleSave(c, idx)} 
                    disabled={savingIdx !== null || saved} 
                    style={{ backgroundColor: isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 50, 107, 0.07)" }}
                    className="flex-row items-center gap-1 px-2.5 py-1.5 rounded-lg active:opacity-70"
                  >
                    <Icon name={saving ? "hourglass-empty" : saved ? "check" : "save"} size={13} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontSize: 10, fontWeight: "700" }}>{saving ? "Saving" : saved ? "Saved" : "Save"}</Text>
                  </Pressable>
                )}
              </View>
              <View className="mt-3 gap-2">
                {phones.map((p: any, pi: number) => (
                  <Pressable 
                    key={pi} 
                    onPress={() => Linking.openURL(`tel:${p.value.replace(/[^0-9+]/g, "")}`).catch(() => { })} 
                    className="flex-row items-center gap-2.5 p-1.5 rounded-lg active:opacity-70"
                  >
                    <Icon name="phone" size={15} color={colors.outline} />
                    <View className="flex-1">
                      <Text style={{ color: colors.primary, fontSize: 14, fontWeight: "500" }}>{p.value}</Text>
                      <Text style={{ color: colors.outline, fontSize: 10 }}>{p.label || "Phone"}</Text>
                    </View>
                  </Pressable>
                ))}
                {emails.map((e: any, ei: number) => (
                  <Pressable 
                    key={ei} 
                    onPress={() => Linking.openURL(`mailto:${e.value}`).catch(() => { })} 
                    className="flex-row items-center gap-2.5 p-1.5 rounded-lg active:opacity-70"
                  >
                    <Icon name="email" size={15} color={colors.outline} />
                    <View className="flex-1">
                      <Text style={{ color: colors.primary, fontSize: 14, fontWeight: "500" }} numberOfLines={1}>{e.value}</Text>
                      <Text style={{ color: colors.outline, fontSize: 10 }}>{e.label || "Email"}</Text>
                    </View>
                  </Pressable>
                ))}
                {addrs.map((a: any, ai: number) => (
                  <View key={ai} className="flex-row items-start gap-2.5 p-1.5">
                    <Icon name="place" size={15} color={colors.outline} />
                    <View className="flex-1">
                      <Text style={{ color: colors.onSurface, fontSize: 14, fontWeight: "500", lineHeight: 18 }}>{a.value}</Text>
                      <Text style={{ color: colors.outline, fontSize: 10 }}>{a.label || "Address"}</Text>
                    </View>
                  </View>
                ))}
                {org.map((o: any, oi: number) => (
                  <View key={oi} className="flex-row items-start gap-2.5 p-1.5">
                    <Icon name="business" size={15} color={colors.outline} />
                    <View className="flex-1">
                      <Text style={{ color: colors.onSurface, fontSize: 14, fontWeight: "500", lineHeight: 18 }}>{o.value}</Text>
                      <Text style={{ color: colors.outline, fontSize: 10 }}>{o.label}</Text>
                    </View>
                  </View>
                ))}
                {!phones.length && !emails.length && !addrs.length && !org.length && (
                  <View 
                    style={{ backgroundColor: colors.surfaceContainerLowest }}
                    className="px-2 py-2 rounded-lg"
                  >
                    <Text style={{ color: colors.outline, fontSize: 12 }}>No contact details available.</Text>
                  </View>
                )}
                {errIdx === idx && <Text className="text-[10px] font-semibold text-red-500">Could not save. Check the phone number.</Text>}
              </View>
            </View>
          );
        })}
      </View>
    </Bubble>
  );
});

const LocationMessage = React.memo(({ message }: { message: NormalizedChatMessage }) => {
  const isDark = useThemeStore((state) => state.isDark);
  const colors = useThemeStore((state) => state.colors);

  const location = getLocationPayload(message);
  const lat = location?.latitude ?? location?.lat;
  const lng = location?.longitude ?? location?.lng ?? location?.long;
  const name = location?.name || message.content || "Shared location";
  const address = location?.address || "";

  return (
    <Bubble message={message} wide>
      <View 
        style={{
          backgroundColor: isDark ? "rgba(0, 0, 0, 0.25)" : "rgba(255, 255, 255, 0.75)",
          borderColor: colors.divider,
          borderWidth: 1,
        }}
        className="rounded-xl overflow-hidden min-w-[240px]"
      >
        <View className="p-3">
          <View className="flex-row items-start gap-2">
            <Icon name="place" size={20} color="#0284c7" />
            <View className="flex-1">
              <Text style={{ color: colors.onSurface, fontSize: 14, fontWeight: "600" }} numberOfLines={1}>{name}</Text>
              {address ? <Text style={{ color: colors.outline, fontSize: 12, marginTop: 2 }} numberOfLines={2}>{address}</Text> : null}
              {lat !== undefined && lng !== undefined ? <Text style={{ color: colors.outline, fontSize: 10, marginTop: 2 }}>{lat}, {lng}</Text> : null}
            </View>
          </View>
        </View>
        {lat !== undefined && lng !== undefined && (
          <Pressable 
            onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`).catch(() => Alert.alert("Error", "Could not open Google Maps."))} 
            style={{ 
              backgroundColor: isDark ? "rgba(2, 132, 199, 0.2)" : "rgba(207, 233, 250, 0.6)",
              borderTopColor: colors.divider,
              borderTopWidth: 1,
            }}
            className="py-2.5 flex-row justify-center items-center gap-1.5 active:opacity-80"
          >
            <Icon name="map" size={16} color={isDark ? "#7dd3fc" : "#00326b"} />
            <Text style={{ fontSize: 12, fontWeight: "700", color: isDark ? "#7dd3fc" : "#00326b" }}>Open in Maps</Text>
          </Pressable>
        )}
      </View>
    </Bubble>
  );
});

const StickerMessage = React.memo(({ message }: { message: NormalizedChatMessage }) => {
  const colors = useThemeStore((state) => state.colors);

  const media = useMessageMedia({
    mediaId: message.mediaId,
    messageType: message.type,
    chatId: message.chatId,
    directUrl: message.mediaUrl,
    phoneNumberId: message.accountId,
  });

  return (
    <Bubble message={message}>
      {media.loading ? (
        <View className="w-32 h-32 items-center justify-center">
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : media.url ? (
        <Image source={{ uri: media.url }} style={{ width: 128, height: 128 }} className="bg-transparent" contentFit="contain" />
      ) : (
        <View className="flex-row items-center gap-2 py-1">
          <Icon name="sentiment-satisfied" size={20} color={colors.outline} />
          <Text style={{ color: colors.outline, fontSize: 13.5, fontWeight: "600" }}>Sticker unavailable</Text>
        </View>
      )}
    </Bubble>
  );
});

const UnsupportedMessage = React.memo(({ message }: { message: NormalizedChatMessage }) => {
  const colors = useThemeStore((state) => state.colors);
  const raw = useMemo(() => { const p = parseMaybeJson(message.content); return typeof p === "string" ? p : message.content; }, [message.content]);

  return (
    <Bubble message={message}>
      <View className="flex-row items-start gap-2.5 py-1 max-w-[260px]">
        <Icon name="info-outline" size={18} color={colors.outline} style={{ marginTop: 2 }} />
        <View className="flex-1">
          <Text style={{ color: colors.onSurface, fontSize: 14, fontWeight: "600" }}>Unsupported message</Text>
          <Text style={{ color: colors.outline, fontSize: 10, marginTop: 2 }}>{raw || `Type: ${message.type}`}</Text>
        </View>
      </View>
    </Bubble>
  );
});

export const MessageRenderer = React.memo(({ message }: { message: NormalizedChatMessage }) => {
  switch (message.type) {
    case "template": return <TemplateMessage key={message._id} message={message} />;
    case "document": return <DocumentMessage key={message._id} message={message} />;
    case "image": return <ImageMessage key={message._id} message={message} />;
    case "video": return <VideoMessage key={message._id} message={message} />;
    case "audio": return <AudioMessage key={message._id} message={message} />;
    case "button": return <ButtonMessage key={message._id} message={message} />;
    case "interactive": return <InteractiveMessage key={message._id} message={message} />;
    case "order": return <OrderMessage key={message._id} message={message} />;
    case "contacts": return <ContactsMessage key={message._id} message={message} />;
    case "location": return <LocationMessage key={message._id} message={message} />;
    case "sticker": return <StickerMessage key={message._id} message={message} />;
    case "unsupported": return <UnsupportedMessage key={message._id} message={message} />;
    case "text": default: return <TextMessage key={message._id} message={message} />;
  }
});