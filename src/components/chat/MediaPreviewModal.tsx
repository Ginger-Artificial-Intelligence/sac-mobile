import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, TextInput, View } from "react-native";
import { useKeyboardHeight } from "../../hooks/useKeyboardHeight";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import type { ImageManipulatorContext } from "expo-image-manipulator";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "../ui/Text";
import { Icon } from "../ui/Icon";
import { useThemeStore } from "../../store/themeStore";
import type { PickedMedia } from "../../lib/mediaUpload";

interface Entry {
  media: PickedMedia;
  original: PickedMedia; // to undo edits
  caption: string;
}

export interface PreviewResult {
  media: PickedMedia;
  caption: string;
}

const CROPS = [
  { label: "Square", ratio: 1 },
  { label: "4:3", ratio: 4 / 3 },
  { label: "3:4", ratio: 3 / 4 },
  { label: "16:9", ratio: 16 / 9 },
];

/** Centered crop of the largest area with the wanted ratio */
export function centerCrop(width: number, height: number, ratio: number) {
  if (width / height > ratio) {
    const w = Math.round(height * ratio);
    return { originX: Math.round((width - w) / 2), originY: 0, width: w, height };
  }
  const h = Math.round(width / ratio);
  return { originX: 0, originY: Math.round((height - h) / 2), width, height: h };
}

function VideoPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
  });
  return <VideoView player={player} style={{ width: "100%", height: "100%" }} contentFit="contain" nativeControls />;
}

export function MediaPreviewModal({
  items,
  initialCaption,
  onClose,
  onSend,
}: {
  items: PickedMedia[] | null;
  initialCaption: string;
  onClose: () => void;
  onSend: (results: PreviewResult[]) => void;
}) {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const colors = useThemeStore((s) => s.colors);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showCrops, setShowCrops] = useState(false);

  useEffect(() => {
    if (!items) return;
    setEntries(items.map((m, i) => ({ media: m, original: m, caption: i === 0 ? initialCaption : "" })));
    setIndex(0);
    setShowCrops(false);
  }, [items]);

  const current = entries[index];
  const media = current?.media;
  const isImage = media?.kind === "image";
  const canCaption = media && media.kind !== "audio";

  const setCaption = (text: string) =>
    setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, caption: text } : e)));

  const removeCurrent = () => {
    if (entries.length <= 1) return onClose();
    setEntries((prev) => prev.filter((_, i) => i !== index));
    setIndex((i) => Math.max(0, i - 1));
  };

  // Rotate / flip / crop an image and replace the file with the edited copy
  const edit = async (apply: (ctx: ImageManipulatorContext, flip: typeof import("expo-image-manipulator").FlipType) => void) => {
    if (!media || !isImage || busy) return;
    setBusy(true);
    try {
      // Loaded only when you edit: a build made before expo-image-manipulator was added still opens the
      // chat and the preview (editing then explains that the app needs a rebuild)
      let Manipulator: typeof import("expo-image-manipulator");
      try {
        Manipulator = require("expo-image-manipulator");
      } catch {
        Alert.alert("Editing needs an updated app", "Rebuild the app to edit images. You can still send this one as it is.");
        return;
      }
      const ctx = Manipulator.ImageManipulator.manipulate(media.uri);
      apply(ctx, Manipulator.FlipType);
      const rendered = await ctx.renderAsync();
      const saved = await rendered.saveAsync({ format: Manipulator.SaveFormat.JPEG, compress: 0.85 });
      setEntries((prev) =>
        prev.map((e, i) =>
          i === index
            ? {
                ...e,
                media: {
                  ...e.media,
                  uri: saved.uri,
                  mimeType: "image/jpeg",
                  name: e.media.name.replace(/\.[^.]+$/, "") + ".jpg",
                  size: null, // unknown after re-encoding
                  width: saved.width,
                  height: saved.height,
                },
              }
            : e
        )
      );
    } catch (e) {
      console.warn("[preview] edit failed:", e);
      Alert.alert("Could not edit the image", "Try again, or send the original.");
    } finally {
      setBusy(false);
    }
  };

  const crop = (ratio: number) => {
    setShowCrops(false);
    const w = media?.width;
    const h = media?.height;
    if (!w || !h) return Alert.alert("Can't crop this image", "Its size is unknown. Rotate it once and try again.");
    edit((ctx) => ctx.crop(centerCrop(w, h, ratio)));
  };

  const edited = useMemo(() => !!current && current.media.uri !== current.original.uri, [current]);

  const reset = () =>
    setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, media: e.original } : e)));

  const send = () => onSend(entries.map((e) => ({ media: e.media, caption: canCaptionFor(e.media) ? e.caption.trim() : "" })));

  const tool = (icon: string, onPress: () => void, disabled = false) => (
    <Pressable onPress={onPress} disabled={disabled || busy} style={{ padding: 10, opacity: disabled || busy ? 0.4 : 1 }} hitSlop={4}>
      <Icon name={icon as any} size={24} color="#ffffff" />
    </Pressable>
  );

  return (
    <Modal visible={items !== null} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: "#000", paddingBottom: keyboardHeight }}>
        {/* Top bar */}
        <View style={{ paddingTop: Math.max(insets.top, 12), flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8 }}>
          <Pressable onPress={onClose} style={{ padding: 10 }} hitSlop={6}>
            <Icon name="close" size={26} color="#ffffff" />
          </Pressable>
          <Text style={{ color: "#fff", fontWeight: "600" }}>{entries.length > 1 ? `${index + 1} of ${entries.length}` : ""}</Text>
          <Pressable onPress={removeCurrent} style={{ padding: 10 }} hitSlop={6}>
            <Icon name="delete-outline" size={24} color="#ffffff" />
          </Pressable>
        </View>

        {/* Preview */}
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          {!media ? null : media.kind === "image" ? (
            <Image source={{ uri: media.uri }} style={{ width: "100%", height: "100%" }} contentFit="contain" />
          ) : media.kind === "video" ? (
            <VideoPreview key={media.uri} uri={media.uri} />
          ) : (
            <View style={{ alignItems: "center", gap: 12, padding: 24 }}>
              <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" }}>
                <Icon name={media.kind === "audio" ? "audiotrack" : "insert-drive-file"} size={44} color="#ffffff" />
              </View>
              <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600", textAlign: "center" }} numberOfLines={3}>{media.name}</Text>
              {!!media.size && <Text style={{ color: "rgba(255,255,255,0.7)" }}>{(media.size / (1024 * 1024)).toFixed(1)} MB</Text>}
            </View>
          )}
          {busy && (
            <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.4)" } as any}>
              <ActivityIndicator color="#fff" size="large" />
            </View>
          )}
        </View>

        {/* Image editing tools (videos, documents and audio cannot be edited here) */}
        {isImage && (
          <View>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 }}>
              {tool("rotate-left", () => edit((c) => c.rotate(-90)))}
              {tool("rotate-right", () => edit((c) => c.rotate(90)))}
              {tool("flip", () => edit((c, flip) => c.flip(flip.Horizontal)))}
              {tool("crop", () => setShowCrops((v) => !v))}
              {tool("restore", reset, !edited)}
            </View>
            {showCrops && (
              <View style={{ flexDirection: "row", justifyContent: "center", gap: 8, paddingBottom: 6 }}>
                {CROPS.map((c) => (
                  <Pressable key={c.label} onPress={() => crop(c.ratio)} style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.15)" }}>
                    <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}>{c.label}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Thumbnails when several files are selected */}
        {entries.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 12, paddingVertical: 8 }}>
            {entries.map((e, i) => (
              <Pressable
                key={e.media.uri + i}
                onPress={() => {
                  setIndex(i);
                  setShowCrops(false);
                }}
                style={{ width: 52, height: 52, borderRadius: 8, overflow: "hidden", borderWidth: 2, borderColor: i === index ? colors.primary : "transparent", backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" }}
              >
                {e.media.kind === "image" ? (
                  <Image source={{ uri: e.media.uri }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                ) : (
                  <Icon name={e.media.kind === "video" ? "videocam" : e.media.kind === "audio" ? "audiotrack" : "insert-drive-file"} size={24} color="#fff" />
                )}
              </Pressable>
            ))}
          </ScrollView>
        )}

        {/* Caption + send */}
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 10, paddingTop: 8, paddingBottom: keyboardHeight > 0 ? 34 : Math.max(insets.bottom, 10) + 12 }}>
          <View style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.14)", borderRadius: 22, paddingHorizontal: 14, minHeight: 44, justifyContent: "center" }}>
            {canCaption ? (
              <TextInput
                value={current?.caption ?? ""}
                onChangeText={setCaption}
                placeholder="Add a caption…"
                placeholderTextColor="rgba(255,255,255,0.6)"
                multiline
                style={{ color: "#fff", fontSize: 15, maxHeight: 100, paddingVertical: 8 }}
              />
            ) : (
              <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, paddingVertical: 10 }}>Audio files are sent without a caption</Text>
            )}
          </View>
          <Pressable onPress={send} disabled={busy || entries.length === 0} style={{ backgroundColor: colors.primary, width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", opacity: busy ? 0.5 : 1 }}>
            <Icon name="send" size={22} color={colors.onPrimary} />
            {entries.length > 1 && (
              <View style={{ position: "absolute", top: -4, right: -4, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }}>
                <Text style={{ color: "#000", fontSize: 11, fontWeight: "800" }}>{entries.length}</Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const canCaptionFor = (m: PickedMedia) => m.kind !== "audio";
