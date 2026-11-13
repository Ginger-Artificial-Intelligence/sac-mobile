import React, { useState, useEffect, useRef, useMemo } from "react";
import { View, Pressable, Modal, Linking, Alert, ActivityIndicator, ScrollView, StatusBar, ToastAndroid, Platform } from "react-native";
import { Text } from "../ui/Text";
import { Icon } from "../ui/Icon";
import { Image } from "expo-image";
import { NormalizedChatMessage, formatMessageTime, formatFileSize, getMediaPayload, getTemplatePayload, getInteractivePayload, getContactsPayload, getLocationPayload, getObjectPayload, asArray, parseMaybeJson } from "../../lib/messageUtils";
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
import { useQuery } from "@tanstack/react-query";
import { resolveTemplateView, typeOf, type TemplateMedia, type TemplateCardView } from "../../lib/templateView";
import { copyText } from "../../lib/clipboard";
import { AccountPickerModal } from "../contacts/AccountPickerModal";

/** The chat screen provides this: scrolls to (and highlights) the message a reply quotes */
export const ReplyJumpContext = React.createContext<(replyTo: any) => void>(() => {});

// Text bubbles put the time inside the last line (WhatsApp style): the text ends with an invisible copy
// of the time so it wraps to make room, and the real time sits on top of it at the bottom right.
const metaSpacer = (message: NormalizedChatMessage) => {
  const name = message.isOutgoing && message.senderName ? `${String(message.senderName).slice(0, 18)} • ` : "";
  const time = message.createdAt ? formatMessageTime(message.createdAt) : "";
  // Non-breaking spaces: Android drops ordinary spaces at the end of a line, which would make it too short
  // (a space is narrow in this font, so the tick icon and gaps need a good run of them)
  return `     ${name}${time}${message.isOutgoing ? "             " : ""}`.replace(/ /g, " ");
};

const Bubble = React.memo(({ message, children, wide = false, outside, inlineMeta = false }: { message: NormalizedChatMessage; children: React.ReactNode; wide?: boolean; outside?: React.ReactNode; inlineMeta?: boolean }) => {
  const isMe = message.isOutgoing;
  const isDark = useThemeStore((state) => state.isDark);
  const colors = useThemeStore((state) => state.colors);
  const formattedTime = message.createdAt ? formatMessageTime(message.createdAt) : "";
  const firstInRun = (message as any).firstInRun !== false;
  const bubbleColor = isMe ? colors.bubbleOut : colors.bubbleIn;

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
    if (raw === 3 || raw === "3" || String(raw).toLowerCase() === "read") return "#53bdeb";
    if (raw === 4 || raw === "4" || String(raw).toLowerCase() === "failed") return "#e53935";
    return isDark ? "rgba(255,255,255,0.6)" : "#667781";
  };

  return (
    <View
      className={cn("flex-row", isMe ? "justify-end" : "justify-start")}
      style={{ paddingLeft: 14, paddingRight: 14, paddingTop: firstInRun ? 6 : 1, paddingBottom: 1 }}
    >
      <View className={cn(wide || (message as any).message?.referral ? "max-w-[88%]" : "max-w-[80%]", isMe ? "items-end" : "items-start")}>
      <View
        style={{
          backgroundColor: bubbleColor,
          borderRadius: 8,
          borderTopRightRadius: isMe && firstInRun ? 0 : 8,
          borderTopLeftRadius: !isMe && firstInRun ? 0 : 8,
          paddingHorizontal: 8,
          paddingTop: 6,
          paddingBottom: inlineMeta ? 7 : 5,
          elevation: 1,
          shadowColor: "#000",
          shadowOpacity: isDark ? 0 : 0.12,
          shadowRadius: 0.5,
          shadowOffset: { width: 0, height: 1 },
        }}
      >
        {/* The tail on the first bubble of a run, like WhatsApp */}
        {firstInRun && (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 0,
              [isMe ? "right" : "left"]: -8,
              width: 0,
              height: 0,
              borderTopWidth: 10,
              borderTopColor: bubbleColor,
              [isMe ? "borderRightWidth" : "borderLeftWidth"]: 9,
              [isMe ? "borderRightColor" : "borderLeftColor"]: "transparent",
            }}
          />
        )}
        <ForwardedLabel message={message} />
        <ReplyPreview message={message} />
        <AdReferralCard message={message} />
        {children}
        <View
          className="flex-row justify-end items-center gap-1"
          style={inlineMeta ? { position: "absolute", right: 8, bottom: 5 } : { marginTop: 3 }}
        >
          {(message as any).pinned === true && <Icon name="push-pin" size={11} color={colors.outline} />}
          {isMe && message.senderName && (
            <Text
              style={{ color: isDark ? "rgba(255,255,255,0.6)" : "#667781", fontSize: 11 }}
              numberOfLines={1}
            >
              {String(message.senderName).slice(0, 18)} •
            </Text>
          )}
          <Text
            style={{ color: isDark ? "rgba(255,255,255,0.6)" : "#667781", fontSize: 11 }}
          >
            {formattedTime}
          </Text>
          {isMe && <Icon name={getStatusIconName()} size={13} color={getStatusIconColor()} />}
        </View>
      </View>
      <ReactionPill reactions={(message as any).reactions} isMe={isMe} />
      {outside ? <View style={{ alignSelf: "stretch" }}>{outside}</View> : null}
      </View>
    </View>
  );
});

const ForwardedLabel = React.memo(({ message }: { message: NormalizedChatMessage }) => {
  const colors = useThemeStore((state) => state.colors);
  const m: any = message;
  if (!(m.isForwarded || m.forwarded || m.message?.context?.forwarded)) return null;
  return (
    <View className="flex-row items-center gap-1 mb-1">
      <Icon name="reply" size={12} color={colors.outline} style={{ transform: [{ scaleX: -1 }] }} />
      <Text style={{ color: colors.outline, fontSize: 11, fontStyle: "italic" }}>Forwarded</Text>
    </View>
  );
});

const safeHttp = (v?: string) => (v && /^https?:\/\//i.test(v) ? v : undefined);

/** "Message via ad": the Meta ad the customer clicked before writing */
const AdReferralCard = React.memo(({ message }: { message: NormalizedChatMessage }) => {
  const isDark = useThemeStore((state) => state.isDark);
  const colors = useThemeStore((state) => state.colors);
  const ref = (message as any).message?.referral || (message as any).referral;
  if (!ref || typeof ref !== "object") return null;
  const isVideo = ref.media_type === "video";
  const media = safeHttp(isVideo ? ref.thumbnail_url || ref.video_url : ref.image_url);
  const link = safeHttp(ref.source_url);
  return (
    <Pressable
      disabled={!link}
      onPress={() => link && Linking.openURL(link).catch(() => {})}
      style={{ borderColor: colors.divider, borderWidth: 1, backgroundColor: isDark ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.7)", alignSelf: "stretch", minWidth: 230 }}
      className="mb-2 rounded-lg overflow-hidden"
    >
      <View className="flex-row items-center gap-1.5 px-2.5 py-1.5" style={{ borderBottomColor: colors.divider, borderBottomWidth: 1 }}>
        <Icon name="campaign" size={13} color={colors.outline} />
        <Text style={{ color: colors.outline, fontSize: 11 }}>Message via ad</Text>
      </View>
      {media ? <Image source={{ uri: media }} style={{ width: "100%", height: 120 }} contentFit="cover" /> : null}
      {ref.headline || ref.body ? (
        <View className="px-2.5 py-2">
          {ref.headline ? <Text style={{ color: colors.onSurface, fontSize: 13, fontWeight: "600" }}>{ref.headline}</Text> : null}
          {ref.body ? <Text style={{ color: colors.outline, fontSize: 12, marginTop: 2 }} numberOfLines={2}>{ref.body}</Text> : null}
        </View>
      ) : null}
    </Pressable>
  );
});

const ReactionPill = React.memo(({ reactions, isMe }: { reactions?: { emoji: string; fromMe: boolean }[]; isMe: boolean }) => {
  const colors = useThemeStore((state) => state.colors);
  if (!reactions?.length) return null;
  const counts = new Map<string, number>();
  for (const { emoji } of reactions) counts.set(emoji, (counts.get(emoji) || 0) + 1);
  return (
    <View className={cn("flex-row", isMe ? "justify-end pr-2" : "justify-start pl-2")} style={{ marginTop: -8, zIndex: 2 }}>
      <View style={{ backgroundColor: colors.surfaceContainerLowest, borderColor: colors.divider, borderWidth: 1 }} className="flex-row items-center gap-1.5 rounded-full px-2 py-0.5 shadow-xs">
        {Array.from(counts, ([emoji, n]) => (
          <Text key={emoji} style={{ fontSize: 14 }}>{emoji}{n > 1 ? <Text style={{ fontSize: 11, color: colors.outline }}> {n}</Text> : null}</Text>
        ))}
      </View>
    </View>
  );
});

const URL_RX = /^(https?:\/\/[^\s]+|www\.[^\s]+)$/i;
const PHONE_RX = /^\+?[0-9][0-9\s().\-]{6,}[0-9]$/;

const RichText = React.memo(({ text, muted, isOutgoing, trailing }: { text: unknown; muted?: boolean; isOutgoing?: boolean; trailing?: string }) => {
  const isDark = useThemeStore((state) => state.isDark);
  const colors = useThemeStore((state) => state.colors);
  const normalized = String(text ?? "").replace(/\\n/g, "\n");
  if (!normalized) return null;

  const defaultColor = isDark ? "#e9edef" : "#111b21";

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
        fontSize: muted ? 12.5 : 15,
        lineHeight: muted ? 18 : 21,
      }}
      selectable
    >
      {nodes}
      {trailing ? <Text style={{ fontSize: 11, color: isOutgoing ? colors.bubbleOut : colors.bubbleIn }}>{trailing}</Text> : null}
    </Text>
  );
});

const ReplyPreview = React.memo(({ message }: { message: NormalizedChatMessage }) => {
  const isDark = useThemeStore((state) => state.isDark);
  const colors = useThemeStore((state) => state.colors);
  const jump = React.useContext(ReplyJumpContext);
  const replyTo = (message as any).reply_to;
  if (!replyTo) return null;
  const sender = replyTo.sender || replyTo.senderName || "";
  const type = replyTo.message_type || replyTo.type || "";
  const content = replyTo.content ||
    (type === "image" ? "📷 Image" : type === "video" ? "🎥 Video" : type === "audio" ? "🎤 Audio" : type === "document" ? "📄 Document" : type === "location" ? "📍 Location" : (type === "template" || replyTo.templateName) ? (replyTo.templateName ? `Template: ${replyTo.templateName}` : "📋 Template") : "");
  if (!sender && !content) return null;

  return (
    // WhatsApp quote: a rounded box with a straight colour bar down its left edge
    <Pressable
      onPress={() => jump(replyTo)}
      style={{
        flexDirection: "row",
        backgroundColor: isDark ? "rgba(0,0,0,0.22)" : "rgba(0,0,0,0.05)",
        borderRadius: 7,
        overflow: "hidden",
        marginBottom: 4,
        minWidth: 160,
      }}
    >
      <View style={{ width: 4, backgroundColor: isDark ? "#a5b3ff" : "#7b6ae0" }} />
      <View style={{ flex: 1, paddingHorizontal: 8, paddingVertical: 6 }}>
        {sender ? <Text style={{ color: isDark ? "#a5b3ff" : "#5b4ec7", fontSize: 13, fontWeight: "700" }} numberOfLines={1}>{sender}</Text> : null}
        {content ? <Text style={{ color: isDark ? "rgba(255,255,255,0.65)" : "#667781", fontSize: 13, marginTop: 1 }} numberOfLines={2}>{content}</Text> : null}
      </View>
    </Pressable>
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
  <Bubble message={message} inlineMeta>
    <RichText text={message.content || "[text message]"} isOutgoing={message.isOutgoing} trailing={metaSpacer(message)} />
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

  const media = useMessageMedia({
    mediaId: message.mediaId,
    messageType: message.type,
    chatId: message.chatId,
    directUrl: message.mediaUrl,
    phoneNumberId: message.accountId,
    autoLoad: true,
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
              backgroundColor: isDark ? "rgba(0,0,0,0.35)" : colors.surfaceContainerLowest,
              borderColor: colors.divider,
              borderWidth: 1,
            }}
            className="w-[250px] h-[200px] rounded-xl items-center justify-center gap-2"
          >
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={{ color: colors.outline, fontSize: 11, fontWeight: "600" }}>Downloading image…</Text>
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
            onPress={media.loadMedia}
            style={{
              backgroundColor: isDark ? "rgba(0,0,0,0.35)" : "rgba(0, 50, 107, 0.04)",
              borderColor: colors.divider,
              borderWidth: 1,
            }}
            className="w-[250px] h-[180px] rounded-xl items-center justify-center active:opacity-85"
          >
            <View
              style={{ backgroundColor: isDark ? "rgba(255, 255, 255, 0.15)" : colors.primary }}
              className="w-12 h-12 rounded-full items-center justify-center mb-2 shadow-sm"
            >
              <Icon name="refresh" size={24} color="#ffffff" />
            </View>
            <Text style={{ color: colors.onSurface, fontSize: 12, fontWeight: "700" }}>
              {media.error ? "Failed to load" : "Image"}
            </Text>
            <Text style={{ color: colors.outline, fontSize: 11, marginTop: 2 }}>Tap to load</Text>
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

  const media = useMessageMedia({
    mediaId: message.mediaId,
    messageType: message.type,
    chatId: message.chatId,
    directUrl: message.mediaUrl,
    phoneNumberId: message.accountId,
    autoLoad: message.isOutgoing,
  });
  const [modal, setModal] = useState(false);

  const handlePress = () => {
    if (media.url) setModal(true);
    else media.loadMedia();
  };

  return (
    <>
      <Bubble message={message} wide>
        {media.loading ? (
          <View
            style={{
              backgroundColor: isDark ? "rgba(0,0,0,0.35)" : colors.surfaceContainerLowest,
              borderColor: colors.divider,
              borderWidth: 1,
            }}
            className="w-[250px] h-[200px] rounded-xl items-center justify-center gap-2"
          >
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={{ color: colors.outline, fontSize: 11, fontWeight: "600" }}>Downloading video…</Text>
          </View>
        ) : media.url ? (
          <Pressable onPress={() => setModal(true)} className="active:opacity-90">
            <View className="w-[250px] h-[200px] rounded-xl bg-black overflow-hidden justify-center items-center">
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
            onPress={media.loadMedia}
            style={{
              backgroundColor: isDark ? "rgba(0,0,0,0.35)" : "rgba(0, 50, 107, 0.04)",
              borderColor: colors.divider,
              borderWidth: 1,
            }}
            className="w-[250px] h-[180px] rounded-xl items-center justify-center active:opacity-85"
          >
            <View
              style={{ backgroundColor: isDark ? "rgba(255, 255, 255, 0.15)" : colors.primary }}
              className="w-12 h-12 rounded-full items-center justify-center mb-2 shadow-sm"
            >
              <Icon name="refresh" size={24} color="#ffffff" />
            </View>
            <Text style={{ color: colors.onSurface, fontSize: 12, fontWeight: "700" }}>
              {media.error ? "Failed to load" : "Video"}
            </Text>
            <Text style={{ color: colors.outline, fontSize: 11, marginTop: 2 }}>Tap to load</Text>
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
    autoLoad: true,
  });
  const player = useAudioPlayer(media.url ? { uri: media.url } : null);
  const status = useAudioPlayerStatus(player);
  const fmt = (s: number) => { const t = Math.floor(s); return `${Math.floor(t / 60)}:${t % 60 < 10 ? "0" : ""}${t % 60}`; };
  const dur = status.duration || 0;
  const cur = status.currentTime || 0;
  const pct = dur > 0 ? (cur / dur) * 100 : 0;

  const handleAudioPress = () => {
    if (media.loading) return;
    if (!media.url) {
      media.loadMedia();
      return;
    }
    if (status.playing) player.pause();
    else player.play();
  };

  return (
    <Bubble message={message} wide inlineMeta>
      {/* WhatsApp voice note: play button, progress track with a knob, time under it, mic mark at the end */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, minWidth: 250, paddingBottom: 14 }}>
        <Pressable
          onPress={handleAudioPress}
          disabled={media.loading}
          accessibilityLabel={status.playing ? "Pause voice message" : "Play voice message"}
          hitSlop={8}
          style={{ width: 40, height: 44, alignItems: "center", justifyContent: "center" }}
        >
          {media.loading || status.isBuffering ? (
            <ActivityIndicator size="small" color={isDark ? "#8696a0" : "#54656f"} />
          ) : !media.url ? (
            <Icon name="download" size={28} color={isDark ? "#8696a0" : "#54656f"} />
          ) : (
            <Icon name={status.playing ? "pause" : "play-arrow"} size={36} color={isDark ? "#8696a0" : "#54656f"} />
          )}
        </Pressable>
        <View style={{ flex: 1, justifyContent: "center", height: 44 }}>
          <View style={{ height: 3, borderRadius: 2, backgroundColor: isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.15)" }}>
            <View style={{ width: `${pct}%`, height: "100%", borderRadius: 2, backgroundColor: colors.chatAccent }} />
          </View>
          <View
            style={{
              position: "absolute",
              left: `${pct}%`,
              marginLeft: -6,
              width: 12,
              height: 12,
              borderRadius: 6,
              backgroundColor: status.playing || pct > 0 ? colors.chatAccent : "#53bdeb",
            }}
          />
          <Text style={{ position: "absolute", bottom: -12, left: 0, fontSize: 11, color: isDark ? "rgba(255,255,255,0.6)" : "#667781" }}>
            {status.playing || cur > 0 ? fmt(cur) : dur > 0 ? fmt(dur) : media.url ? "0:00" : "Tap to load"}
          </Text>
        </View>
        <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: message.isOutgoing ? colors.chatAccent : (isDark ? "#374248" : "#dfe5e7") }}>
          <Icon name="mic" size={22} color={message.isOutgoing ? colors.onChatAccent : (isDark ? "#e9edef" : "#54656f")} />
        </View>
      </View>
      {media.error && <Text style={{ fontSize: 11, color: colors.error, marginTop: 2 }}>Audio expired or unavailable</Text>}
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
    autoLoad: false,
  });
  const [downloading, setDownloading] = useState(false);
  const fileName = message.mediaFileName || message.content || "Document";
  const ext = fileName.includes(".") ? fileName.split(".").pop()?.toUpperCase() : message.mediaMimeType || "DOC";

  const handleDownload = async () => {
    if (downloading) return;
    if (!media.url && message.mediaId) {
      media.loadMedia();
      return;
    }
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
          ) : !media.url ? (
            <Icon name="refresh" size={18} color={colors.outline} />
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

  // Saving asks which WhatsApp account the contact belongs to; nothing is saved until one is picked
  const [pendingSave, setPendingSave] = useState<{ c: any; idx: number } | null>(null);

  const handleSave = async (c: any, idx: number, chosenAccountId: string) => {
    const first = asArray<any>(c?.phones || c?.phone_numbers || c?.phoneNumbers)[0];
    // WhatsApp's own id for the number (digits with country code) is the most reliable; else the typed number
    const phone = (first && typeof first === "object" && first.wa_id) || getPhones(c)[0]?.value || "";
    if (!phone || savingIdx !== null) return;
    const clean = String(phone).replace(/[^0-9]/g, "");
    if (clean.length < 8) { setErrIdx(idx); return; }
    setSavingIdx(idx); setErrIdx(null);
    try {
      const accountId = chosenAccountId;
      const res = await API.post("/chats", { phoneNumber: clean, ...(accountId ? { accountId } : {}), channel: "whatsapp" });
      const id = String(res.data?.chat?._id ?? "");
      const name = getContactName(c);
      if (id && name) {
        try { await API.put("/contacts/update-contact", { chatId: id, name, phone_number_id: accountId }); } catch { /* the number is saved even if the name is not */ }
      }
      useSyncStore.getState().refreshRecent({ force: true });
      await loadContacts();
      setSavedSet(prev => new Set(prev).add(idx));
    } catch (e: any) {
      // Already a contact: nothing to save
      if (e?.response?.status === 409) setSavedSet(prev => new Set(prev).add(idx));
      else setErrIdx(idx);
    } finally { setSavingIdx(null); }
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
                    onPress={() => setPendingSave({ c, idx })}
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
      <AccountPickerModal
        visible={pendingSave !== null}
        title="Save contact to"
        confirmLabel="Save"
        onClose={() => setPendingSave(null)}
        onConfirm={(accountId) => {
          const pending = pendingSave;
          setPendingSave(null);
          if (pending) handleSave(pending.c, pending.idx, accountId);
        }}
      />
    </Bubble>
  );
});

const useTemplateDefinition = (name: string, phoneNumberId: string) => {
  const { data } = useQuery({
    queryKey: ["inbox-templates", phoneNumberId],
    enabled: !!phoneNumberId && !!name,
    staleTime: 10 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const res = await API.get("/template", { params: { phone_number_id: phoneNumberId, limit: 1000 } });
      const rows = res.data?.templates?.data || res.data?.templates || res.data?.data || [];
      return (Array.isArray(rows) ? rows : []) as any[];
    },
  });
  return name ? data?.find((t) => t?.name === name) ?? null : null;
};

const TemplateHeader = React.memo(({ message, media, height = 170 }: { message: NormalizedChatMessage; media: TemplateMedia; height?: number }) => {
  const isDark = useThemeStore((state) => state.isDark);
  const colors = useThemeStore((state) => state.colors);
  const resolved = useMessageMedia({
    mediaId: media.url ? undefined : media.id || (media.type === "TEXT" ? undefined : message.mediaId),
    messageType: String(media.type).toLowerCase(),
    chatId: message.chatId,
    directUrl: media.url || (media.type === "TEXT" ? undefined : message.mediaUrl),
    phoneNumberId: message.accountId,
    autoLoad: media.type === "IMAGE",
  });
  const [modal, setModal] = useState(false);
  const url = resolved.url || (media.url && /^https?:/i.test(media.url) ? media.url : "");
  const box = { width: "100%" as const, height, borderRadius: 10, overflow: "hidden" as const, marginBottom: 8 };

  if (media.type === "IMAGE") {
    return (
      <>
        <Pressable disabled={!url} onPress={() => setModal(true)} style={[box, { backgroundColor: isDark ? "rgba(0,0,0,0.3)" : "rgba(0,50,107,0.06)", alignItems: "center", justifyContent: "center" }]}>
          {url ? (
            <Image source={{ uri: url }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
          ) : resolved.loading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <View className="items-center gap-1">
              <Icon name="image" size={28} color={colors.outline} />
              <Text style={{ color: colors.outline, fontSize: 11 }}>Image</Text>
            </View>
          )}
        </Pressable>
        {url ? <FullscreenMediaModal visible={modal} onClose={() => setModal(false)} mediaUrl={url} type="image" message={message} /> : null}
      </>
    );
  }
  if (media.type === "VIDEO") {
    return (
      <>
        <Pressable onPress={() => (url ? setModal(true) : resolved.loadMedia())} style={[box, { backgroundColor: "#000", alignItems: "center", justifyContent: "center" }]}>
          {resolved.loading ? <ActivityIndicator color="#fff" /> : <Icon name="play-circle-filled" size={44} color="#fff" />}
        </Pressable>
        {url ? <FullscreenMediaModal visible={modal} onClose={() => setModal(false)} mediaUrl={url} type="video" message={message} /> : null}
      </>
    );
  }
  if (media.type === "DOCUMENT") {
    return (
      <Pressable
        disabled={!url}
        onPress={() => url && Linking.openURL(url).catch(() => {})}
        style={{ backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)", borderRadius: 10, padding: 10, marginBottom: 8 }}
        className="flex-row items-center gap-2"
      >
        <Icon name="description" size={20} color="#ef4444" />
        <Text style={{ color: colors.onSurface, fontSize: 13, fontWeight: "600", flex: 1 }} numberOfLines={1}>{media.filename || "Document"}</Text>
      </Pressable>
    );
  }
  if (media.type === "LOCATION" && media.latitude != null && media.longitude != null) {
    return (
      <Pressable
        onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${media.latitude},${media.longitude}`).catch(() => {})}
        style={{ backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)", borderRadius: 10, padding: 10, marginBottom: 8 }}
        className="flex-row items-center gap-2"
      >
        <Icon name="place" size={22} color="#0284c7" />
        <Text style={{ color: colors.onSurface, fontSize: 13, flex: 1 }} numberOfLines={2}>
          {media.name || `${media.latitude}, ${media.longitude}`}
        </Text>
      </Pressable>
    );
  }
  if (media.type === "TEXT" && media.text) {
    return <Text style={{ color: colors.onSurface, fontSize: 15, fontWeight: "700", marginBottom: 6 }}>{media.text}</Text>;
  }
  return null;
});

const safeUrl = (v?: unknown) => {
  const s = String(v ?? "").trim();
  return /^https?:\/\//i.test(s) ? s : undefined;
};

/** WhatsApp-style action rows: full width, divider-separated, with an icon per button type */
const TemplateButtonRows = React.memo(({ buttons, flat = false }: { buttons: Record<string, any>[]; flat?: boolean }) => {
  const isDark = useThemeStore((state) => state.isDark);
  const colors = useThemeStore((state) => state.colors);
  const list = buttons.filter((b) => b && typeof b === "object");
  if (!list.length) return null;
  const link = isDark ? "#7dd3fc" : "#0b6bcb";

  const rows = list.map((btn, i) => {
    const types = [btn.sub_type, btn.type].map((v) => String(v || "").toUpperCase());
    const label = String(btn.text || btn.title || btn.parameters?.[0]?.text || "Action");
    const isUrl = types.includes("URL");
    const isPhone = types.includes("PHONE_NUMBER");
    const isCopy = types.includes("COPY_CODE");
    const isFlow = types.includes("FLOW");
    const icon = isUrl ? "open-in-new" : isPhone ? "call" : isCopy ? "content-copy" : isFlow ? "dynamic-form" : "reply";
    const href = isUrl ? safeUrl(btn.url || btn.parameters?.[0]?.text) : isPhone && btn.phone_number ? `tel:${String(btn.phone_number).replace(/[^\d+]/g, "")}` : undefined;
    const code = isCopy ? String(btn.example?.[0] || btn.parameters?.[0]?.coupon_code || btn.coupon_code || "") : "";
    const onPress = href ? () => Linking.openURL(href).catch(() => {}) : isCopy && code ? () => copyText(code) : undefined;
    return (
      <Pressable
        key={i}
        disabled={!onPress}
        onPress={onPress}
        style={{ borderTopColor: flat && i === 0 ? "transparent" : colors.divider, borderTopWidth: flat && i === 0 ? 0 : 1, minHeight: 42 }}
        className="flex-row items-center justify-center gap-2 px-3 py-2.5 active:opacity-60"
      >
        <Icon name={icon as any} size={16} color={link} />
        <Text style={{ color: link, fontSize: 14, fontWeight: "600", flexShrink: 1 }} numberOfLines={1}>{label}</Text>
      </Pressable>
    );
  });

  if (flat) return <View>{rows}</View>;
  return (
    <View
      style={{ backgroundColor: isDark ? "#121d2b" : "#ffffff", borderColor: colors.divider, borderWidth: 1, borderRadius: 14, marginTop: 4, overflow: "hidden", alignSelf: "stretch" }}
    >
      {rows}
    </View>
  );
});

// Templates are shown in full (no "Read more"), with every variable filled in from the values sent
const TemplateBody = ({ text, isOutgoing }: { text: string; isOutgoing: boolean }) => (
  <RichText text={text} isOutgoing={isOutgoing} />
);

const TemplateCarousel = React.memo(({ message, cards }: { message: NormalizedChatMessage; cards: TemplateCardView[] }) => {
  const isDark = useThemeStore((state) => state.isDark);
  const colors = useThemeStore((state) => state.colors);
  if (!cards.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }} contentContainerStyle={{ gap: 8 }}>
      {cards.map((card) => (
        <View
          key={String(card.key)}
          style={{ width: 240, backgroundColor: isDark ? "#121d2b" : "#ffffff", borderColor: colors.divider, borderWidth: 1, borderRadius: 14, overflow: "hidden" }}
        >
          {card.media ? <View style={{ padding: 6, paddingBottom: 0 }}><TemplateHeader message={message} media={card.media} height={150} /></View> : null}
          {card.body ? (
            <View className="px-3 pb-2">
              <RichText text={card.body} isOutgoing={false} />
            </View>
          ) : null}
          <TemplateButtonRows buttons={card.buttons} />
        </View>
      ))}
    </ScrollView>
  );
});

const TemplateMessage = React.memo(({ message }: { message: NormalizedChatMessage }) => {
  const colors = useThemeStore((state) => state.colors);
  const template = getTemplatePayload(message);
  const components = useMemo(
    () => asArray<any>(template?.savedContent?.template?.components || template?.components).filter((c) => c && typeof c === "object"),
    [template]
  );
  const name = String((message as any).templateName || template?.name || "");
  const definition = useTemplateDefinition(name, String((message as any).phone_number_id || message.accountId || ""));
  const view = useMemo(
    () =>
      resolveTemplateView(components, definition, {
        directBody: template?.rendered_text || template?.body_text || template?.savedContent?.rendered_text || template?.savedContent?.body_text || "",
        messageText: message.content,
        name,
        footer: template?.footer,
      }),
    [components, definition, template, message.content, name]
  );
  const isCarousel = components.some((c: any) => typeOf(c) === "carousel") || view.cards.length > 0;
  const products = asArray<any>(template?.products).filter((p) => p && typeof p === "object");
  const title = (message as any).templateTitle || name || "Template message";
  const bodyText = view.body || (isCarousel ? "" : title);

  return (
    <Bubble
      message={message}
      wide
      outside={
        isCarousel ? (
          <TemplateCarousel message={message} cards={view.cards} />
        ) : view.buttons.length ? (
          <TemplateButtonRows buttons={view.buttons} />
        ) : undefined
      }
    >
      <View style={{ minWidth: 220 }}>
        {view.header && !isCarousel ? <TemplateHeader message={message} media={view.header} /> : null}
        {bodyText ? <TemplateBody text={bodyText} isOutgoing={message.isOutgoing} /> : null}
        {view.footer ? <Text style={{ color: colors.outline, fontSize: 12, marginTop: 4 }}>{view.footer}</Text> : null}
        {products.map((p: any, i: number) => (
          <View key={i} style={{ backgroundColor: "rgba(0,0,0,0.05)", borderRadius: 10, padding: 8, marginTop: 6 }} className="flex-row items-center gap-2">
            {p.image_url ? <Image source={{ uri: p.image_url }} style={{ width: 46, height: 46, borderRadius: 8 }} contentFit="cover" /> : null}
            <View className="flex-1">
              <Text style={{ color: colors.onSurface, fontSize: 12.5, fontWeight: "600" }} numberOfLines={1}>{p.product_name || p.name || "Product"}</Text>
            </View>
            {p.price ? <Text style={{ color: colors.onSurface, fontSize: 12.5, fontWeight: "600" }}>{p.price}</Text> : null}
          </View>
        ))}
      </View>
    </Bubble>
  );
});

const InteractiveMessage = React.memo(({ message }: { message: NormalizedChatMessage }) => {
  const isDark = useThemeStore((state) => state.isDark);
  const colors = useThemeStore((state) => state.colors);

  const interactive = getInteractivePayload(message);
  const rawAction = interactive?.action || {};
  const buttons = asArray<any>(rawAction.buttons);
  const sections = asArray<any>(rawAction.sections);
  const rows = sections.flatMap((s: any) => asArray<any>(s.rows));
  const header = interactive?.header || {};
  const body = interactive?.body || {};
  const footer = interactive?.footer?.text || "";

  const headerText = header.text || "";
  const headerImageUrl = header.image?.link || header.image?.url;
  const isAddrReq = String(rawAction.name || "").toLowerCase() === "address_message";
  const ctaUrl = rawAction.parameters?.url;
  const ctaLabel = rawAction.parameters?.display_text;
  const fallback = body.text || message.content || "Interactive message";

  const [modal, setModal] = useState(false);

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
                style={{ width: "100%", height: 140, borderRadius: 8, marginBottom: 8 }}
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
  const items = asArray<any>(order?.product_items);
  const title = (message as any).title || "Order Details";

  return (
    <Bubble message={message} wide>
      <View
        style={{
          backgroundColor: isDark ? "rgba(0, 0, 0, 0.25)" : "rgba(255, 255, 255, 0.75)",
          borderColor: colors.divider,
          borderWidth: 1,
        }}
        className="rounded-xl p-3 min-w-[240px]"
      >
        <View className="flex-row items-center gap-2 mb-2">
          <Icon name="shopping-bag" size={16} color={colors.primary} />
          <Text style={{ color: colors.onSurface, fontSize: 14, fontWeight: "700" }}>{title}</Text>
        </View>
        {items.map((it: any, idx: number) => (
          <View
            key={idx}
            style={{
              backgroundColor: isDark ? "#121d2b" : "#ffffff",
              borderColor: colors.divider,
              borderWidth: 1,
            }}
            className="p-2 rounded-lg mb-1 flex-row justify-between items-center"
          >
            <View className="flex-1">
              <Text style={{ color: colors.onSurface, fontSize: 12, fontWeight: "600" }}>{it.product_retailer_id || it.name || "Item"}</Text>
              <Text style={{ color: colors.outline, fontSize: 10 }}>Qty: {it.quantity || 1}</Text>
            </View>
            <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>{it.item_price || it.price ? `₹${it.item_price || it.price}` : ""}</Text>
          </View>
        ))}
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
  const isDark = useThemeStore((state) => state.isDark);
  const colors = useThemeStore((state) => state.colors);

  const media = useMessageMedia({
    mediaId: message.mediaId,
    messageType: message.type,
    chatId: message.chatId,
    directUrl: message.mediaUrl,
    phoneNumberId: message.accountId,
    autoLoad: true,
  });

  return (
    <Bubble message={message}>
      {media.loading ? (
        <View className="w-28 h-28 items-center justify-center">
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : media.url ? (
        <Image source={{ uri: media.url }} style={{ width: 128, height: 128 }} className="bg-transparent" contentFit="contain" />
      ) : (
        <Pressable
          onPress={media.loadMedia}
          style={{
            backgroundColor: isDark ? "rgba(0,0,0,0.25)" : "rgba(0,50,107,0.05)",
            borderColor: colors.divider,
            borderWidth: 1,
          }}
          className="w-28 h-28 rounded-xl items-center justify-center active:opacity-80 gap-1.5 p-2"
        >
          <Icon name="refresh" size={22} color={colors.primary} />
          <Text style={{ color: colors.outline, fontSize: 11, fontWeight: "600", textAlign: "center" }}>Tap to load sticker</Text>
        </Pressable>
      )}
    </Bubble>
  );
});

// Customer feedback / survey answers (CSAT stars, NPS score, comment)
const sentimentOf = (type: string, scoreStr: string) => {
  const n = parseFloat(scoreStr);
  if (type === "nps") {
    if (n >= 9) return { label: "Promoter", color: "#16a34a" };
    if (n >= 7) return { label: "Passive", color: "#d97706" };
    if (n >= 0) return { label: "Detractor", color: "#dc2626" };
  } else if (Number.isFinite(n)) {
    if (n >= 4.5) return { label: "Very satisfied", color: "#16a34a" };
    if (n >= 3.5) return { label: "Satisfied", color: "#16a34a" };
    if (n >= 2.5) return { label: "Neutral", color: "#d97706" };
    if (n >= 1.5) return { label: "Unsatisfied", color: "#d97706" };
    if (n >= 1) return { label: "Very unsatisfied", color: "#dc2626" };
  }
  return { label: "Submitted", color: "#737782" };
};

const parseFeedback = (message: any) => {
  const payload = message.message || {};
  const nfm = payload.interactive?.nfm_reply || payload.nfm_reply || message.interactive?.nfm_reply;
  const nfmJson: any = nfm ? getObjectPayload(parseMaybeJson(nfm.response_json)) : {};
  const data: any = getObjectPayload(payload.feedback ?? message.feedback ?? payload.messaging_feedback ?? message.messaging_feedback);
  let score = String(data.score ?? nfmJson.score ?? nfmJson.rating ?? "");
  let scoreType = String(data.scoreType || nfmJson.scoreType || "csat").toLowerCase();
  let comment = String(data.comment ?? nfmJson.comment ?? "");
  if (!score && Array.isArray(data.feedback_screens)) {
    for (const screen of data.feedback_screens) {
      const questions = screen?.questions && typeof screen.questions === "object" ? screen.questions : {};
      for (const key of Object.keys(questions)) {
        const q = questions[key];
        if (!q) continue;
        if (!score && q.payload != null) score = String(q.payload);
        if (q.type) scoreType = String(q.type).toLowerCase();
        if (!comment && q.follow_up?.payload != null) comment = String(q.follow_up.payload);
      }
    }
  }
  if (!comment && message.content && !String(message.content).startsWith("Customer Feedback:") && !nfm) comment = String(message.content);
  return { score, scoreType, comment };
};

const FeedbackMessage = React.memo(({ message }: { message: NormalizedChatMessage }) => {
  const isDark = useThemeStore((state) => state.isDark);
  const colors = useThemeStore((state) => state.colors);
  const { score, scoreType, comment } = parseFeedback(message);
  const numeric = parseFloat(score) || 0;
  const isNps = scoreType === "nps";
  const sentiment = sentimentOf(scoreType, score);
  const filled = Math.max(0, Math.min(5, Math.round(numeric)));
  return (
    <Bubble message={message} wide>
      <View style={{ backgroundColor: isDark ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.75)", borderColor: colors.divider, borderWidth: 1 }} className="rounded-xl p-3 min-w-[240px]">
        <View className="flex-row items-center justify-between gap-2 mb-2">
          <View className="flex-row items-center gap-2">
            <Icon name="star" size={18} color="#d97706" />
            <Text style={{ color: colors.onSurface, fontSize: 14, fontWeight: "700" }}>Customer feedback</Text>
          </View>
          <Text style={{ color: colors.outline, fontSize: 10, fontWeight: "700" }}>{scoreType.toUpperCase()}</Text>
        </View>
        <View className="flex-row items-center justify-between gap-2">
          {!isNps && numeric > 0 ? (
            <View className="flex-row items-center gap-1.5">
              <View className="flex-row">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Icon key={n} name={n <= filled ? "star" : "star-border"} size={18} color={n <= filled ? "#f59e0b" : colors.outline} />
                ))}
              </View>
              <Text style={{ color: colors.onSurface, fontWeight: "700" }}>{Math.min(5, numeric)}/5</Text>
            </View>
          ) : (
            <View className="flex-row items-center gap-2">
              <View style={{ borderColor: sentiment.color, borderWidth: 2 }} className="w-9 h-9 rounded-full items-center justify-center">
                <Text style={{ color: sentiment.color, fontWeight: "700" }}>{score || "N/A"}</Text>
              </View>
              {isNps ? <Text style={{ color: colors.onSurface, fontWeight: "700", fontSize: 13 }}>Out of 10</Text> : null}
            </View>
          )}
          <Text style={{ color: sentiment.color, fontSize: 12, fontWeight: "700" }}>{sentiment.label}</Text>
        </View>
        {comment ? (
          <View style={{ backgroundColor: colors.surfaceContainerLow, borderColor: colors.divider, borderWidth: 1 }} className="mt-3 rounded-lg p-2.5">
            <Text selectable style={{ color: colors.onSurface, fontSize: 13, fontStyle: "italic" }}>"{comment}"</Text>
          </View>
        ) : null}
      </View>
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

class RowErrorBoundary extends React.Component<{ resetKey: unknown; children: React.ReactNode }, { failed: boolean; resetKey: unknown }> {
  state = { failed: false, resetKey: this.props.resetKey };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  // A changed message gets another chance to render
  static getDerivedStateFromProps(props: { resetKey: unknown }, state: { resetKey: unknown }) {
    return props.resetKey !== state.resetKey ? { failed: false, resetKey: props.resetKey } : null;
  }
  componentDidCatch(error: unknown) {
    console.warn("[chat] message row failed to render", error);
  }
  render() {
    if (this.state.failed) {
      return (
        <View className="px-4 py-1">
          <Text style={{ fontSize: 12, opacity: 0.6 }}>Couldn't display this message</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export const MessageRenderer = React.memo(({ message }: { message: NormalizedChatMessage }) => (
  <RowErrorBoundary resetKey={message}>
    <MessageSwitch message={message} />
  </RowErrorBoundary>
));

const MessageSwitch = ({ message }: { message: NormalizedChatMessage }) => {
  switch (message.type) {
    case "feedback": return <FeedbackMessage key={message._id} message={message} />;
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
};
