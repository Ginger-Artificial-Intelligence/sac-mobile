import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, useAudioRecorder, useAudioRecorderState } from "expo-audio";
import { Icon } from "./Icon";
import { Text } from "./Text";
import { useThemeStore } from "../../store/themeStore";

const MIN_DURATION_MS = 800;

const formatTime = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

/**
 * Replaces the message box while a voice note is recorded. Mounted only during a recording, so the
 * native recorder is not created every time a chat opens. Recording starts on mount.
 *
 * While recording you can pause / resume, or stop to review: the recorded note then plays back with a
 * progress bar before you send or delete it.
 * The backend converts the upload to ogg/opus when it is flagged as a voice note.
 */
export function VoiceRecorderBar({
  onCancel,
  onDone,
  bottomPadding,
}: {
  onCancel: () => void;
  onDone: (result: { uri: string; durationMs: number }) => void;
  bottomPadding: number;
}) {
  const colors = useThemeStore((s) => s.colors);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 200);
  const started = useRef(false);
  const finished = useRef(false);
  const [paused, setPaused] = useState(false);
  const [review, setReview] = useState<{ uri: string; durationMs: number } | null>(null);

  const player = useAudioPlayer(review ? { uri: review.uri } : null);
  const playback = useAudioPlayerStatus(player);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const permission = await AudioModule.requestRecordingPermissionsAsync();
        if (!permission.granted) {
          Alert.alert("Microphone needed", "Allow microphone access in your phone settings to record voice messages.");
          onCancel();
          return;
        }
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        if (cancelled) return;
        recorder.record();
        started.current = true;
      } catch (e) {
        console.warn("[voice] could not start recording:", e);
        Alert.alert("Could not record", "The microphone could not be started.");
        onCancel();
      }
    })();

    return () => {
      cancelled = true;
      if (started.current && !finished.current) recorder.stop().catch(() => {});
      // Give the audio session back to playback (message sounds)
      setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    };
  }, []);

  const stopAndGet = async () => {
    finished.current = true;
    try {
      await recorder.stop();
    } catch {
      /* already stopped */
    }
    return recorder.uri;
  };

  const handleCancel = async () => {
    if (!review) await stopAndGet();
    player.pause();
    onCancel();
  };

  const togglePause = () => {
    if (!started.current) return;
    try {
      if (paused) {
        recorder.record();
        setPaused(false);
      } else {
        recorder.pause();
        setPaused(true);
      }
    } catch (e) {
      console.warn("[voice] pause/resume failed:", e);
    }
  };

  // Stop recording and switch to the review player
  const handleReview = async () => {
    const durationMs = state.durationMillis;
    const uri = await stopAndGet();
    if (!uri || durationMs < MIN_DURATION_MS) {
      onCancel(); // a tap, not a message
      return;
    }
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    setPaused(false);
    setReview({ uri, durationMs });
  };

  const handleSend = async () => {
    if (review) {
      player.pause();
      onDone(review);
      return;
    }
    const durationMs = state.durationMillis;
    const uri = await stopAndGet();
    if (!uri || durationMs < MIN_DURATION_MS) {
      onCancel();
      return;
    }
    onDone({ uri, durationMs });
  };

  const togglePlay = () => {
    if (playback.playing) {
      player.pause();
      return;
    }
    // Replay from the start once it has finished
    if (playback.duration > 0 && playback.currentTime >= playback.duration - 0.05) player.seekTo(0);
    player.play();
  };

  const roundBtn = "w-11 h-11 rounded-full items-center justify-center active:opacity-70";
  const pct = review && playback.duration > 0 ? Math.min(100, (playback.currentTime / playback.duration) * 100) : 0;

  return (
    <View className="px-2 py-2 flex-row items-center gap-2 z-10" style={{ paddingBottom: bottomPadding }}>
      <Pressable onPress={handleCancel} hitSlop={8} className={roundBtn}>
        <Icon name="delete" size={24} color={colors.outline} />
      </Pressable>

      <View
        style={{ backgroundColor: colors.surfaceContainerLowest, borderColor: colors.divider, borderWidth: 1 }}
        className="flex-1 rounded-[22px] flex-row items-center pl-1.5 pr-4 min-h-[44px] gap-2"
      >
        {review ? (
          <>
            <Pressable onPress={togglePlay} hitSlop={6} style={{ backgroundColor: colors.primary }} className="w-8 h-8 rounded-full items-center justify-center active:opacity-80">
              <Icon name={playback.playing ? "pause" : "play-arrow"} size={20} color={colors.onPrimary} />
            </Pressable>
            <View className="flex-1 h-1 rounded-full overflow-hidden" style={{ backgroundColor: colors.divider }}>
              <View style={{ width: `${pct}%`, backgroundColor: colors.primary, height: "100%" }} />
            </View>
            <Text style={{ color: colors.onSurface, fontSize: 13, fontWeight: "600", minWidth: 36, textAlign: "right" }}>
              {formatTime(playback.playing || playback.currentTime > 0 ? playback.currentTime * 1000 : review.durationMs)}
            </Text>
          </>
        ) : (
          <>
            <Pressable onPress={togglePause} hitSlop={6} className="w-8 h-8 rounded-full items-center justify-center active:opacity-70">
              <Icon name={paused ? "mic" : "pause"} size={20} color={paused ? "#ef4444" : colors.outline} />
            </Pressable>
            <Text style={{ color: colors.onSurface, fontSize: 16, fontWeight: "600" }}>{formatTime(state.durationMillis)}</Text>
            <Text style={{ color: colors.outline, fontSize: 13, flex: 1 }}>
              {paused ? "Paused" : state.isRecording ? "Recording…" : "Starting…"}
            </Text>
            <Pressable onPress={handleReview} hitSlop={6} className="w-8 h-8 rounded-full items-center justify-center active:opacity-70">
              <Icon name="stop-circle" size={24} color={colors.primary} />
            </Pressable>
          </>
        )}
      </View>

      <Pressable
        onPress={handleSend}
        style={{ backgroundColor: colors.primary }}
        className="w-11 h-11 rounded-full items-center justify-center shadow-md active:opacity-80"
      >
        <Icon name="send" size={22} color={colors.onPrimary} />
      </Pressable>
    </View>
  );
}
